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

const SceneSchema = z.object({
  id: z.string().min(1).max(12),
  start: z.number().min(0),
  duration: z.number().min(1).max(15),
  purpose: z.string().min(2).max(24),
  voiceover: z.string().max(400),
  // THE FRAME'S OWN COPY CHANNEL. Was `.max(4)`, which was the ceiling for a
  // field the prompt described as "the keyword, the number, the imperative" —
  // i.e. a distillation of the spoken line. It is now the film's second
  // information channel (system_script.md hard rule 5) and carries a whole
  // frame's hierarchy: headline, the fact that proves it, then labels. A
  // very-fast film budgets 6 elements a frame (services/pacing.js MODES), so 4
  // was a cap the pacing engine could no longer express. 8 leaves headroom
  // above the densest mode without letting a scene become a document.
  //
  // The per-line 80 stays: it is a schema bound, not the real one. The binding
  // limit is readability, and pacing.visualCapacity() derives that per scene
  // from the actual clock (27 chars on a 2.3s very-fast frame, 51 on a relaxed
  // one), which no fixed number in a schema could get right.
  onScreenText: z.array(z.string().min(1).max(80)).max(8).default([]),
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

// Words a voice can comfortably speak per second.
//
// This is now the pacing engine's constant rather than a fourth private copy of
// 2.6 (services/vo_fit.js and services/caption_director.js hold the others).
// NOTE it is a property of the VOICE, so it does NOT move with the pace mode:
// a Fast film is not read faster, it is written shorter. That is why every
// production-time consumer of this rate — vo_fit's tighten target, the caption
// duration estimate — stays correct at every pace without being touched.
const WORDS_PER_SEC = pacing.BASE_SPEECH_RATE;
// Allow this much VO overrun before flagging (vo_fit tightens later anyway).
const VO_TOLERANCE = 1.35;

function wordCount(s) { return (s.trim().match(/\S+/g) || []).length; }

// Re-derive starts from durations (sequential, gapless) and round to 0.1s.
// Lets the editor change durations / reorder / delete scenes without having
// to keep `start` fields consistent by hand.
function normalizeScript(script, { targetDuration } = {}) {
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
  let t = 0;
  s.scenes.forEach((scene, i) => {
    scene.id = scene.id || `s${i + 1}`;
    // Clamp per-scene duration into the schema range [1,15] here (coerce) so a
    // long-form script where the model emitted a 13-20s scene is FIXED instead
    // of hard-failing validation (the drift loop below re-absorbs the delta into
    // the total). Matches the storyboard's [2,15] and the redistribution clamp.
    scene.duration = Math.min(15, Math.max(1, Math.round((Number(scene.duration) || 4) * 10) / 10));
    scene.start = Math.round(t * 10) / 10;
    t += scene.duration;
    // Clamp per-scene arrays to the schema caps so a minor overflow (e.g. the
    // model emits 5 onScreenText lines) is TRIMMED here rather than throwing a
    // hard schema rejection that fails the whole script.
    if (Array.isArray(scene.onScreenText)) scene.onScreenText = scene.onScreenText.slice(0, 8);
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
function validateScript(script, { targetDuration, pacing: pacingCfg } = {}) {
  const errors = [];
  const warnings = [];
  // Absent pacing means "judge it the way this function always has". Callers
  // that HAVE the film's pacing must pass it — notably the approve endpoint,
  // which re-validates a user's edits and would otherwise grade a Fast script
  // against Normal's expectations and reject work the pipeline itself authored.
  const P = pacingCfg || null;

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
    // PHYSICAL FIT — unchanged at every pace, because the speaking rate is
    // unchanged at every pace. This asks "can a human say this in this long?",
    // which has nothing to do with the mode the user picked.
    const capacity = scene.duration * WORDS_PER_SEC;
    if (words > capacity * VO_TOLERANCE) {
      warnings.push(`scene ${scene.id}: VO is ${words} words but ~${Math.floor(capacity)} fit in ${scene.duration}s — will be tightened or feel rushed`);
    }

    // NOTE readability is NOT checked here.
    //
    // It was, briefly, and that was the wrong home: this function runs on every
    // job including default-pace ones, so a pace-independent, PRE-EXISTING
    // defect (copy too short to read) started surfacing as a brand-new warning
    // in the Script Room for films that had not changed in any way. The check is
    // real and worth having — it now lives in services/preflight.js as
    // `textReadable`, which is the production-time disclosure gate, runs against
    // the FINAL re-timed durations, and covers every pace including the default.
    //
    // What stays here is what has always been here: the physical VO-fit warning
    // above, and the film-level pace budget below.
  }

  // THE PACE BUDGET — the one check that is actually about the mode. Separate
  // from the physical fit above on purpose: "this line is too long to say" and
  // "this film says more than its pace allows" are different defects with
  // different fixes, and collapsing them would make a Fast film that is merely
  // wordy look like a film with unspeakable lines.
  //
  // A WARNING, never an error. The budget is an editorial target and the film is
  // still deliverable at 110% of it; vo_fit tightens the overflow at production
  // time. Erroring here would fail generation over a judgement call.
  // Gated on a NON-DEFAULT mode, and that is the last piece of the identity
  // contract: the film-level word budget is a concept this feature introduced,
  // so at `normal` it would be a warning about a film nobody changed, phrased in
  // terms of a thing the user never chose. Wordiness at the default pace is
  // still caught the way it always was — by the per-scene physical VO check
  // above, which is unchanged at every mode.
  if (P && P.mode !== pacing.DEFAULT_MODE && P.voiceover && P.wordBudget > 0) {
    const total = pacing.scriptWordCount(s);
    if (total > P.wordBudget * 1.15) {
      warnings.push(`pacing (${P.label}): the script speaks ${total} words against a ${P.wordBudget}-word budget `
        + `— ${Math.round((total / P.wordBudget - 1) * 100)}% over, so lines will be tightened at production time`);
    }
  }

  const total = Math.round(expectedStart * 10) / 10;
  if (targetDuration && Math.abs(total - targetDuration) > 0.2) {
    errors.push(`scene durations sum to ${total}s; expected ${targetDuration}s`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

const { extractFirstJsonObject: parseLenient } = require("./json_lenient");

// One line telling the script model what the film is being shot on. Reads the
// template profile rather than a table, so it stays true as the library grows,
// and fails silent — a missing or unreadable template simply produces no
// directive, never a wrong one.
function templateDirective(brief) {
  const pack = brief && brief.templateSelection && brief.templateSelection.pack;
  if (!pack) return "";
  let p;
  try { p = require("./template_intelligence").profileOf(pack); } catch { return ""; }
  if (!p) return "";
  const shape = p.orientation === "9:16" ? "a vertical 9:16 phone frame" : "a 16:9 widescreen frame";
  const density = p.density === "text-first"
    ? "This template is TEXT-FIRST — it draws very few pictures, so the words have to carry the film. Give every scene a line strong enough to hold the frame on its own; do not write scenes whose point is an image."
    : p.density === "media-first"
      ? "This template is MEDIA-FIRST — it puts real imagery on screen in most scenes. Keep lines short and let the picture do the explaining; a scene that is all copy wastes its best surface."
      : "This template balances words and pictures — pair each scene's line with something concrete to show.";
  const vibe = String(p.vibeText || "").split(/[.—]/)[0].trim().slice(0, 140);
  return [
    `Template: "${p.templateId}" — ${shape}, authored as roughly a ${Math.round(p.supportedDurations.nativeSec)}s film.`,
    vibe ? `Its visual language: ${vibe}.` : "",
    density,
    "Write copy that belongs in THAT film, not copy a generic template would then have to absorb.",
  ].filter(Boolean).join(" ");
}

// THE USER WROTE THE ORDER — say so, in the USER message.
//
// system_script.md's "shape the beats as Hook -> Problem -> ... -> CTA" is
// unconditional and re-ranks by importance, so a STRUCTURED_STORY prompt would
// otherwise produce exactly the reordered film this whole feature exists to
// prevent. The prompt file is read once at module load (:12) and cannot vary per
// job, so the exception has to arrive here — the same reason pacing.scriptDirective
// does. EMPTY STRING when there is no lock, so the default prompt is byte-identical.
function narrativeDirective(brief) {
  const n = brief && brief.analysis && brief.analysis.narrative;
  if (!n || !n.orderLocked || !Array.isArray(n.beats) || n.beats.length < 2) return "";
  const lines = n.beats.map((b) => {
    const bits = [`${b.index}. ${b.beat}`];
    if (b.mustShow) bits.push(`(must show: ${b.mustShow})`);
    if (b.mustSay) bits.push(`(must say: ${b.mustSay})`);
    return bits.join(" ");
  });
  return [
    "NARRATIVE DIRECTIVE — the user wrote this film's scenes themselves, in this order:",
    ...lines,
    `Scene N of your script IS beat N above, in that exact order. Do not reorder them, do not merge two beats into one scene, do not drop one, and do not insert a new scene before beat 1.`,
    "This directive REPLACES the Hook -> Problem -> ... -> CTA arc and the order-by-importance rule: the user's first beat is the opening and their last beat is the close.",
    "You still write the narration, the on-screen text and the visual direction for each beat — improve them freely. The SEQUENCE and the CONCEPT are theirs.",
  ].join("\n");
}

// WHAT THE SCRIPT MODEL IS SHOWN OF THE BRIEF — an explicit keep-list, not the
// whole object.
//
// This used to be JSON.stringify(brief), which meant `templateSelection` (match
// scores, rejected-pack counts, runner-up names) and the entire resolved `pacing`
// config were being fed to the script model as if they were creative direction.
// Dropping them from the TEXT is safe and deliberate: templateDirective reads
// templateSelection off the brief OBJECT at :222, and pacing arrives as its own
// argument and its own directive — neither depends on being in this JSON.
//
// subject and improvedPrompt are NOT optional here: asset_taxonomy.classify
// (:110-111) and art_director (:166) key off subject, and storyboardPromptFromScript
// passes improvedPrompt as "Context:" (graph.js:134, project_pipeline.js:297).
function scriptFacingBrief(brief) {
  const b = brief || {};
  const a = b.analysis;
  return {
    improvedPrompt: b.improvedPrompt,
    subject: b.subject,
    audience: b.audience,
    tone: b.tone,
    goal: b.goal,
    keyMessages: b.keyMessages,
    mustIncludeFacts: b.mustIncludeFacts,
    musicMood: b.musicMood,
    voProfile: b.voProfile,
    suggestedDuration: b.suggestedDuration,
    ...(a ? { analysis: { narrative: a.narrative, facts: a.facts } } : {}),
  };
}

async function generateScript({ brief, pacing: pacingCfg, signal }) {
  const targetDuration = brief.suggestedDuration;
  // Fall back to the brief's own copy (project_pipeline attaches it there) and
  // then to the default, so this still works when called with the old
  // two-argument shape.
  const P = pacingCfg || brief.pacing || pacing.resolve(pacing.DEFAULT_MODE, { durationSec: targetDuration });
  // EMPTY STRING at `normal`, so a default-pace prompt is byte-identical to the
  // one this function has always sent. The directive rides in the USER message
  // rather than the system prompt for two reasons: system_script.md is read once
  // at module load and cannot vary per job, and the last instruction in the
  // conversation is the one a model weights hardest — which is exactly what an
  // override needs.
  const directive = pacing.scriptDirective(P);
  // WRITE FOR THE TEMPLATE THIS FILM WILL ACTUALLY BE SHOT ON.
  //
  // The template is already chosen by the time the script is written (the brief
  // resolves it, and its scene ceiling is what `pacing` planned the scene count
  // against). What was still missing is the template's own LANGUAGE: a text-first
  // design that paints two pictures needs a script that carries its weight in
  // words, and a media-first one that paints twelve needs lines that leave room
  // for them. Without this the script is written blind and the template has to
  // absorb whatever arrives — which is the "generic video forced into a template"
  // failure. Empty when no template is recorded, so an older brief produces a
  // byte-identical prompt.
  const tpl = templateDirective(brief);
  const nar = narrativeDirective(brief);
  const user = [
    "Creative Brief:",
    JSON.stringify(scriptFacingBrief(brief), null, 2),
    "",
    `Target total duration: ${targetDuration} seconds exactly.`,
    // Spread, not a filtered slot: the "" two lines up is a deliberate blank
    // separator, so filtering empties out of the whole array would have changed
    // the default-pace prompt too — the one thing this must not do.
    ...(directive ? [directive] : []),
    ...(tpl ? [tpl] : []),
    // LAST of the directives, so it is the nearest instruction to "write it now" —
    // it overrides an arc rule stated far above it in the system prompt.
    ...(nar ? [nar] : []),
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
      const raw = normalizeScript(parseLenient(text), { targetDuration });
      const check = validateScript(raw, { targetDuration, pacing: P });
      if (!check.ok) throw new Error(check.errors.join("; "));
      console.log(`[script] ok on attempt ${attempt} (${raw.scenes.length} scenes, ${targetDuration}s, `
        + `${pacing.scriptWordCount(raw)}/${P.wordBudget || "-"} words at ${P.mode}, ${check.warnings.length} pace warning(s))`);
      return { script: raw, warnings: check.warnings, tokensIn: totalIn, tokensOut: totalOut, costUsd: costCalls ? totalCost : null };
    } catch (e) {
      lastErr = e.message;
      console.warn(`[script] attempt ${attempt} invalid: ${lastErr.slice(0, 300)}`);
      userMsg = `${user}\n\nYour previous reply failed validation:\n${lastErr.slice(0, 800)}\nReturn ONLY the corrected JSON object.`;
    }
  }

  throw new Error(`script generation failed after 2 attempts: ${lastErr.slice(0, 500)}`);
}

module.exports = {
  generateScript, validateScript, normalizeScript, ScriptSchema,
  // Underscored: internal seams, exported so scripts/prompt_analysis.test.cjs can
  // assert the two properties that have no other observable surface — that the
  // default-path prompt is byte-identical, and that a locked order reaches the model.
  _narrativeDirective: narrativeDirective,
  _scriptFacingBrief: scriptFacingBrief,
};
