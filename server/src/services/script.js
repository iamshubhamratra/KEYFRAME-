// Stage 3: Creative Brief -> detailed production script (the USER-EDITABLE
// checkpoint). Also exports validateScript() so the approve endpoint can
// re-validate a user-edited script with the same rules, plus normalizeScript()
// which re-derives scene starts so edits to durations stay consistent.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const config = require("../config");
const openrouter = require("./openrouter");
const pacing = require("./pacing");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_script.md"),
  "utf8"
);

const AssetNeedSchema = z.object({
  type: z.enum(["image", "video", "icon"]),
  query: z.string().min(2).max(80),
  role: z.enum(["background", "inset", "texture"]),
});

// A number the frame can land on its own — "6 hours" / "saved every month".
// Kept structured rather than baked into a display string so a renderer can
// animate the figure (counters, stat cards) and style the label separately.
const MetricSchema = z.object({
  value: z.string().min(1).max(16),
  label: z.string().min(2).max(40),
});

// THE TWO CONTENT CHANNELS.
//
// `voiceover` is what the film SAYS; the fields below are what it SHOWS, and
// they are deliberately not a summary of the voiceover. A faster pace buys its
// speed by spending fewer spoken words per scene — so if the visual channel is
// only ever a shortened echo of the spoken one, a fast film ends up saying less
// AND showing less, which is the "fast pace looks empty" report.
//
//   onScreenText — display typography: the headline beat, the keyword, the
//                  imperative. What the eye lands on first.
//   keyPoints    — the supporting facts the voice did NOT have room to say.
//                  These become the pill row / feature list / strike list.
//   metrics      — figures worth animating on their own.
//
// All three are OPTIONAL with a default, so a script written before they
// existed (or by a model that ignores them) parses unchanged and the
// deterministic copy floor in storyboard.js fills the gaps exactly as today.
const SceneSchema = z.object({
  id: z.string().min(1).max(12),
  start: z.number().min(0),
  duration: z.number().min(1).max(15),
  purpose: z.string().min(2).max(24),
  voiceover: z.string().max(400),
  onScreenText: z.array(z.string().min(1).max(80)).max(6).default([]),
  keyPoints: z.array(z.string().min(1).max(60)).max(5).default([]),
  metrics: z.array(MetricSchema).max(3).default([]),
  visualDirection: z.string().min(5).max(500),
  assetNeeds: z.array(AssetNeedSchema).max(3).default([]),
  sfx: z.array(z.string().min(1).max(40)).max(2).default([]),
  musicCue: z.string().min(2).max(20),
});

const ScriptSchema = z.object({
  title: z.string().min(2).max(120),
  scenes: z.array(SceneSchema).min(2).max(200),
  music: z.object({
    mood: z.string().min(2).max(200),
    query: z.string().min(2).max(80),
  }),
  voice: z.object({
    style: z.string().min(2).max(300),
    pace: z.string().min(2).max(40),
  }),
});

// How fast the voice speaks and how much VO overrun is tolerated are both
// per-JOB now (pacing.js): a Fast film budgets against the rate TTS actually
// reads at, not the 2.6 w/s this file asserted for every film. `normal` still
// resolves to 2.6 / 1.35 exactly, so nothing about today's scripts moves.

function wordCount(s) { return (s.trim().match(/\S+/g) || []).length; }

// Re-derive starts from durations (sequential, gapless) and round to 0.1s.
// Lets the editor change durations / reorder / delete scenes without having
// to keep `start` fields consistent by hand.
function normalizeScript(script, { targetDuration, pacing: pacingIn } = {}) {
  const P = pacing.resolve(pacingIn);
  const s = JSON.parse(JSON.stringify(script));
  // Cap scene count first (schema allows max 200 — long-form 10-min films at
  // ~3s/scene) so timing/total below is computed over the kept scenes only.
  if (Array.isArray(s.scenes) && s.scenes.length > 200) {
    // Say it out loud. Dropping scenes here silently shortens the film's plan
    // while the total still snaps to target, so the only visible symptom is
    // scenes that run much longer than authored — a defect with no log line.
    console.warn(`[script] ${s.scenes.length} scenes exceeds the 200 cap — discarding ${s.scenes.length - 200}`);
    s.scenes = s.scenes.slice(0, 200);
  }

  // THE PER-SCENE BAND. [1,15] is the SCHEMA's own range, and `normal` reproduces
  // it to the digit: P.sceneCap IS 15 at 1.0x. The floor stays the schema's 1
  // there rather than becoming P.sceneMin (2.5), because raising it would
  // re-stretch every sub-2.5s scene in every script already approved — exactly
  // the 1.0x change neutrality forbids. Off neutral the ceiling comes in (a Fast
  // film has no business holding one frame for 11s) and the floor rises to the
  // narration floor; Relaxed does the reverse.
  const n = Array.isArray(s.scenes) ? s.scenes.length : 0;
  let loSec = P.neutral ? 1 : P.sceneMin;
  let hiSec = P.sceneCap;
  // ARITHMETIC OUTRANKS PACE. n scenes can only cover [n*loSec, n*hiSec]; a band
  // that puts targetDuration out of reach makes the snap loop below give up
  // short, and validateScript then reports "durations sum to X; expected Y" —
  // which costs a whole generation lap for something no rewrite can fix. Both
  // re-clamps are no-ops at 1.0x by construction: Math.min(15,…) and
  // Math.max(1,…) can only return the literals they replace.
  if (targetDuration && n) {
    if (n * hiSec < targetDuration) {
      const was = hiSec;
      hiSec = Math.min(15, Math.max(hiSec, Math.ceil((targetDuration / n) * 10) / 10));
      if (hiSec !== was) console.warn(`[script] ${P.key} pace caps a scene at ${was}s, but ${n} of them cannot reach ${targetDuration}s — ceiling raised to ${hiSec}s`);
    }
    if (n * loSec > targetDuration) {
      const was = loSec;
      loSec = Math.max(1, Math.min(loSec, Math.floor((targetDuration / n) * 10) / 10));
      if (loSec !== was) console.warn(`[script] ${P.key} pace floors a scene at ${was}s, but ${n} of them overshoot ${targetDuration}s — floor lowered to ${loSec}s`);
    }
  }

  let t = 0;
  s.scenes.forEach((scene, i) => {
    scene.id = scene.id || `s${i + 1}`;
    // Clamp per-scene duration into the band above here (coerce) so a long-form
    // script where the model emitted a 13-20s scene is FIXED instead of
    // hard-failing validation (the drift loop below re-absorbs the delta into
    // the total). Matches the storyboard's [2,15] and the redistribution clamp.
    scene.duration = Math.min(hiSec, Math.max(loSec, Math.round((Number(scene.duration) || 4) * 10) / 10));
    scene.start = Math.round(t * 10) / 10;
    t += scene.duration;
    // Clamp per-scene arrays to the schema caps so a minor overflow (e.g. the
    // model emits 5 onScreenText lines) is TRIMMED here rather than throwing a
    // hard schema rejection that fails the whole script.
    // The DISPLAY channel is clamped by the pace's own visual budget, not by a
    // literal. At normal `visual.keyPoints` is 3 and the +1 keeps the previous
    // ceiling of 4 exactly; a faster pace, which hands the frame more of the
    // message, is allowed the extra lines it asked the writer for.
    const ostMax = Math.max(4, P.visual.keyPoints + 1);
    if (Array.isArray(scene.onScreenText)) scene.onScreenText = scene.onScreenText.slice(0, ostMax);
    if (Array.isArray(scene.keyPoints)) scene.keyPoints = scene.keyPoints.slice(0, P.visual.keyPoints);
    if (Array.isArray(scene.metrics)) scene.metrics = scene.metrics.slice(0, P.visual.metrics);
    if (Array.isArray(scene.assetNeeds)) scene.assetNeeds = scene.assetNeeds.slice(0, 3);
    if (Array.isArray(scene.sfx)) scene.sfx = scene.sfx.slice(0, 2);
  });

  // Snap total to the target duration. Absorb drift into the last scene first,
  // then spill into earlier scenes if it can't take it all within the band, so
  // the total always lands on target instead of failing validation. Starts are
  // then recomputed since redistribution can change non-last durations.
  if (targetDuration && s.scenes.length) {
    const r1 = (n) => Math.round(n * 10) / 10;
    let drift = r1(targetDuration - t);
    for (let guard = 0; Math.abs(drift) >= 0.05 && guard < s.scenes.length * 2; guard++) {
      let moved = false;
      for (let i = s.scenes.length - 1; i >= 0 && Math.abs(drift) >= 0.05; i--) {
        const sc = s.scenes[i];
        const newDur = Math.min(hiSec, Math.max(loSec, r1(sc.duration + drift)));
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
function validateScript(script, { targetDuration, pacing: pacingIn } = {}) {
  const P = pacing.resolve(pacingIn);
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
    // Still a WARNING at every pace. Promoting it to an error would burn both
    // LLM laps on a line vo_fit tightens anyway, and routes/projects.js re-runs
    // this over the user's own hand-edits at the review gate — a fast film would
    // start rejecting the sentences its author just typed.
    const capacity = scene.duration * P.wordsPerSec;
    if (words > capacity * P.voTolerance) {
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

// THE PACE CONTRACT — the per-job scene/word budget, stated in the USER message.
//
// It cannot live in system_script.md: that file is read ONCE at module load, so a
// number baked in there would be whatever the first request of the process asked
// for and every later film would inherit it. The prompt therefore states no scene
// length and no word table of its own any more; this is where those numbers come
// from. At `normal` they are the ones it used to state literally — ~3.5s scenes,
// a 2.5-6s band, 2.6 words/sec — so the table moved, it did not change.
function paceContract(targetDuration, P, target) {
  const r1 = (n) => Math.round(n * 10) / 10;
  // The AVERAGE, not P.sceneSec: on a long film sceneTargetFor clamps the count
  // at maxScenes, and "70 scenes of 3.5s" does not add up to a 600s film. 70 of
  // ~8.6s does, which is the same "stretch the scenes, don't multiply them"
  // instruction the prompt used to spell out for films past 240s.
  const avgSec = target.sceneCount ? r1(targetDuration / target.sceneCount) : target.sceneSec;
  // A word ceiling per scene length so the writer never does the arithmetic —
  // ~5 rows however wide the band is (a long film's band runs 2.5-15s, and a
  // 13-row table is noise the model reads past).
  const span = Math.max(0, target.sceneMax - target.sceneMin);
  const step = span > 4 ? r1(span / 4) : 1;
  const rows = [];
  for (let sec = target.sceneMin; sec <= target.sceneMax + 1e-9 && rows.length < 5; sec = r1(sec + step)) rows.push(sec);
  // The top of the band always gets a row — including for a config-defined mode
  // so fast that the whole band sits under its own floor, where the loop above
  // emits nothing and the writer would be handed a ceiling list with no ceilings.
  if (!rows.length || rows[rows.length - 1] < target.sceneMax) rows.push(target.sceneMax);
  const V = P.visual;
  // THE VISUAL CONTRACT — the half of pace this file used to leave unsaid.
  //
  // Everything above tells the writer to say LESS. Said alone, that is the whole
  // "fast pace looks empty" bug in prompt form: the model compresses the spoken
  // line and compresses `onScreenText` right along with it, and since the Text
  // Director mines its material from exactly those arrays, the frame ends up
  // thinner than the voice. So the same block that takes words out of the mouth
  // has to put them on the screen, in the same breath, with its own numbers.
  //
  // At Normal these read as today's guidance (3 display lines, one figure), so a
  // Normal film asks for exactly what it always asked for.
  const visual = [
    "",
    `ON-SCREEN CONTENT — this is a SEPARATE channel from the voiceover, and at this pace it carries ${V.gain > 1 ? `MORE of the message (${V.gain}x)` : "its usual share"}.`,
    "- The voiceover is what the film SAYS. `onScreenText`, `keyPoints` and `metrics` are what it SHOWS. They are not a summary of the spoken line and never repeat it.",
    `- Per scene: up to ${Math.max(4, V.keyPoints + 1)} \`onScreenText\` display lines, up to ${V.keyPoints} \`keyPoints\`, up to ${V.metrics} \`metrics\`.`,
    `- \`keyPoints\` are the supporting facts the VO had no room for — features, benefits, differentiators, specifics. Each ≤ ${V.lineMaxChars} characters, no trailing period, parallel phrasing across the scene.`,
    "- `metrics` are figures the frame can land on their own: {\"value\":\"6 hours\",\"label\":\"saved every month\"}. Only figures the brief actually supplies.",
    `- Aim for about ${V.elements} text elements per scene across all three fields — enough that the frame carries the beat on its own, few enough to read.`,
    "- HIERARCHY per scene: one headline idea (onScreenText[0]) -> supporting points (keyPoints) -> a figure (metrics). Never a paragraph, never a wall of text — short parallel fragments.",
    "- SPREAD the material across scenes. Each scene shows the points that belong to ITS beat; do not stack the whole feature list onto one frame and leave the others bare.",
  ];
  if (V.gain > 1) {
    visual.push(
      `- This film speaks ${Math.round((1 - 1 / V.gain) * 100)}% fewer words per scene than a Normal one. That information does not disappear — it MOVES to \`keyPoints\` and \`metrics\`. A scene with a four-word VO should still carry ${V.keyPoints} crisp visual points.`,
    );
  }
  return [
    `PACE — ${P.label} (${P.multiplier.toFixed(2)}x). Pace changes DENSITY, never runtime: the ${targetDuration}s total above is fixed.`,
    `- Write about ${target.sceneCount} scenes, averaging ~${avgSec}s each.`,
    `- Every scene's duration is between ${target.sceneMin}s and ${target.sceneMax}s.`,
    `- Speech runs ~${P.wordsPerSec} words/sec at this pace. Per-scene VO ceilings — stay a touch under:`,
    ...rows.map((sec) => `    ${sec}s -> max ${pacing.wordBudget(sec, P)} words`),
    "- Compressing to fit? KEEP the main message, the product's own facts and numbers, the key benefits, and the CTA. DROP repetition, throat-clearing intros, filler adjectives, and description that restates what the picture already shows. What survives must still read like natural speech — full sentences, contractions, no bullet-speak.",
    "- Compression applies to the SPOKEN line only. Cutting a fact from the voiceover means moving it to the visual channel below, never dropping it from the film.",
    ...visual,
  ];
}

async function generateScript({ brief, pacing: pacingIn, signal }) {
  const P = pacing.resolve(pacingIn);
  const targetDuration = brief.suggestedDuration;
  const target = pacing.sceneTargetFor(targetDuration, P);
  // Say it when the pace asks for more scenes than the storyboard can legally
  // hold: the film keeps its runtime with longer scenes, which is a real pace
  // loss and must not be silent.
  const asked = targetDuration > 0 ? Math.round(targetDuration / P.sceneSec) : 0;
  if (asked > target.sceneCount) {
    console.warn(`[script] ${P.label} pace wants ${asked} scenes for ${targetDuration}s — clamped to ${target.sceneCount} (max ${P.maxScenes}); the film holds its runtime with longer scenes instead`);
  }
  const user = [
    "Creative Brief:",
    JSON.stringify(brief, null, 2),
    "",
    `Target total duration: ${targetDuration} seconds exactly.`,
    "",
    ...paceContract(targetDuration, P, target),
    "",
    "Write the production script JSON now.",
  ].join("\n");

  let totalIn = 0, totalOut = 0;
  // Actual charges reported by the provider, summed across retries/laps.
  let totalCost = 0, costCalls = 0;
  let lastErr = "";
  let userMsg = user;

  // The default script model (gemini-2.5-flash) occasionally "lazy stops" and
  // returns a truncated JSON object. openrouter.chat now retries+falls back on
  // that, but as belt-and-suspenders the 2nd attempt escalates to a model that
  // reliably emits the full script (verified: gemini-2.5-pro returns it whole).
  const ESCALATION_MODEL = config.llm.scriptEscalationModel || "google/gemini-2.5-pro";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
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
    if (typeof costUsd === "number") { totalCost += costUsd; costCalls++; }

    try {
      const raw = normalizeScript(parseLenient(text), { targetDuration, pacing: P });
      const check = validateScript(raw, { targetDuration, pacing: P });
      if (!check.ok) throw new Error(check.errors.join("; "));
      console.log(`[script] ok on attempt ${attempt} (${raw.scenes.length} scenes, ${targetDuration}s, ${check.warnings.length} pace warning(s)) — ${pacing.describe(P)}`);
      return { script: raw, warnings: check.warnings, tokensIn: totalIn, tokensOut: totalOut, costUsd: costCalls ? totalCost : null };
    } catch (e) {
      lastErr = e.message;
      console.warn(`[script] attempt ${attempt} invalid: ${lastErr.slice(0, 300)}`);
      userMsg = `${user}\n\nYour previous reply failed validation:\n${lastErr.slice(0, 800)}\nReturn ONLY the corrected JSON object.`;
    }
  }

  throw new Error(`script generation failed after 2 attempts: ${lastErr.slice(0, 500)}`);
}

module.exports = { generateScript, validateScript, normalizeScript, ScriptSchema };
