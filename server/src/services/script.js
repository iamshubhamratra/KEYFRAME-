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

// AN ASSET NEED IS A REQUIREMENT, NOT A SEARCH STRING.
//
// It used to carry three fields — type, query, role — and nothing that said what the picture
// is FOR, whether the scene fails without it, or what shape it has to be. So the planner
// (graph.assetPlannerAgent) could only turn it into "fetch an image for this scene", the
// ranker had nothing to rank a hero against a texture with, and the pre-render gate could not
// tell a missing decoration from a missing product shot.
//
// The four new fields are all OPTIONAL and all defaulted, so a script written before they
// existed — or by a model that ignores them — validates and behaves exactly as before.
// `services/asset_requirements` fills the gaps deterministically from the scene's role and
// the template's own slot contract, so the model is a source of intent, never a bottleneck.
const AssetNeedSchema = z.object({
  type: z.enum(["image", "video", "icon"]),
  query: z.string().min(2).max(80),
  role: z.enum(["background", "inset", "texture"]),
  // WHAT this picture is for, in the product-facing vocabulary the template contract speaks
  // (template_media.KINDS). Steers retrieval and slot matching; never a hard filter.
  purpose: z.enum(["screenshot", "productImage", "person", "object", "place", "icon", "background"]).optional(),
  // How much the scene depends on it. `critical` earns the scene's most prominent box and is
  // what the pre-render gate checks; `low` is texture that may be dropped without harm.
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  // Does the beat read as broken without it? Distinct from priority: a `high` need may still
  // be optional (nice to have, big if present), and a `medium` one may be required.
  required: z.boolean().optional(),
  // A one-line description of the picture in the writer's own words. Retrieval uses `query`;
  // this is what a vision reviewer scores relevance AGAINST, and what a disclosure shows the
  // user when a slot could not be filled.
  visualDescription: z.string().max(220).optional(),
});

const { ROLES, stampRoles } = require("./scene_role");

// THE SCENE CEILING, AND WHY IT MOVED.
//
// 24 scenes x the 12s per-scene cap made 288s the longest film this schema could express — and
// that was invisible until something asked for more, because the API refused anything over 150s
// anyway. Raising maxDurationSec to 320 without raising this would have moved the failure one
// stage later and made it worse: normalizeScript slices to the cap, then validateScript rejects
// the total against a 0.2s tolerance, and generateScript throws after BOTH attempts. Measured at
// targetDuration 300 with 40, 24 and 50 input scenes: all three collapsed to 24x12 = 288 and failed.
//
// 50 is the long-form spine's own ceiling (41 beats, plus headroom for a longer deck). The
// PER-SCENE cap deliberately does NOT move: 40x7.5 and 50x6.0 both sit inside [1,12], so nothing
// here licenses a slower film, only a longer one.
const MAX_SCENES = 50;

const SceneSchema = z.object({
  id: z.string().min(1).max(12),
  start: z.number().min(0),
  duration: z.number().min(1).max(12),
  // `purpose` stays FREE TEXT on purpose: it is the human label the Script Room shows
  // ("The Solution", "Why it matters"). `role` is the canonical enum derived from it by
  // normalizeScript — the thing downstream agents are allowed to switch on. Optional in
  // the schema so a model reply, or a script saved before this field existed, still
  // validates; normalizeScript always stamps it.
  purpose: z.string().min(2).max(24),
  role: z.enum(ROLES).optional(),
  voiceover: z.string().max(400),
  onScreenText: z.array(z.string().min(1).max(80)).max(4).default([]),
  visualDirection: z.string().min(5).max(500),
  assetNeeds: z.array(AssetNeedSchema).max(3).default([]),
  sfx: z.array(z.string().min(1).max(40)).max(2).default([]),
  musicCue: z.string().min(2).max(20),
});

const ScriptSchema = z.object({
  title: z.string().min(2).max(120),
  scenes: z.array(SceneSchema).min(2).max(MAX_SCENES),
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

// CONTENT FLOOR — no scene ships as a bare two-word title.
//
// Measured across the recent 9:16 films, on-screen copy ran 2–6 WORDS PER SCENE:
//
//   755o2m8g21  [5,2,2,4,4,3,4,4,2]      "Meet Claude" · "Steerable Systems" · "Public Benefit"
//   48vb7svz9s  [4,3,3,4,4,4,3,3]
//
// A headline alone on a 720×1280 canvas is a title floating in a tall empty frame — the
// "insufficient text / large empty spaces / weak storytelling" complaint, and half the
// reason those films read as slideshows. The schema permits four lines and requires none;
// `validateScript` only ever warned.
//
// The prompt now ASKS for a supporting line (system_script.md), but a prompt is a request.
// This is the floor: when a scene still arrives with a single line, derive its support
// from the VOICEOVER — which already contains the substance the scene is about, in the
// author's own words. Deterministic, and it cannot fail the job the way a hard schema
// error would.
//
// It only ever ADDS a second line; it never rewrites the model's own copy.
const SUPPORT_MAX_CHARS = 64;

function supportFromVoiceover(vo, headline) {
  const text = String(vo || "").trim();
  if (!text) return null;
  const head = String(headline || "").trim().toLowerCase();
  // Prefer the second sentence: the first usually restates the headline out loud.
  const sentences = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const candidates = sentences.length > 1 ? [sentences[1], sentences[0]] : sentences;
  for (const raw of candidates) {
    let line = raw.replace(/^[-—,;:\s]+/, "").replace(/[.!?]+$/, "").trim();
    if (!line) continue;
    // A line that OPENS with the headline usually carries the real substance right after
    // it — "Meet Claude, built by Anthropic for the frontier". Rejecting the whole
    // sentence as an echo throws that substance away; strip the restated prefix and keep
    // what follows.
    if (head && line.toLowerCase().startsWith(head)) {
      const rest = line.slice(head.length).replace(/^[\s,;:—-]+/, "").trim();
      if (rest.split(/\s+/).filter(Boolean).length >= 2) line = rest.charAt(0).toUpperCase() + rest.slice(1);
    }
    // Anything still saying the same thing as the headline is not support.
    const lc = line.toLowerCase();
    if (head && (lc === head || lc.startsWith(head) || head.startsWith(lc))) continue;
    if (line.length > SUPPORT_MAX_CHARS) {
      // Trim to a clause boundary so the line reads as a phrase, not a truncation.
      const cut = line.slice(0, SUPPORT_MAX_CHARS);
      const brk = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(" — "), cut.lastIndexOf(";"));
      line = (brk > 24 ? cut.slice(0, brk) : cut.slice(0, cut.lastIndexOf(" "))).trim().replace(/[,;:]$/, "");
    }
    if (line.split(/\s+/).filter(Boolean).length < 2) continue;   // one word is not support
    return line;
  }
  return null;
}

function ensureSupportingCopy(scenes) {
  const list = Array.isArray(scenes) ? scenes : [];
  let added = 0;
  for (const sc of list) {
    if (!sc) continue;
    const ost = Array.isArray(sc.onScreenText) ? sc.onScreenText.filter((t) => String(t || "").trim()) : [];
    if (ost.length >= 2) { sc.onScreenText = ost.slice(0, 4); continue; }
    const support = supportFromVoiceover(sc.voiceover, ost[0]);
    if (!support) { sc.onScreenText = ost; continue; }
    sc.onScreenText = [...ost, support].slice(0, 4);
    added++;
  }
  if (added) console.log(`[script] content floor: derived a supporting line for ${added} scene(s) that arrived with a bare headline`);
  return added;
}

// Re-derive starts from durations (sequential, gapless) and round to 0.1s.
// Lets the editor change durations / reorder / delete scenes without having
// to keep `start` fields consistent by hand.
function normalizeScript(script, { targetDuration } = {}) {
  const s = JSON.parse(JSON.stringify(script));
  // Cap scene count first (schema allows max 24) so timing/total below is
  // computed over the kept scenes only.
  if (Array.isArray(s.scenes) && s.scenes.length > MAX_SCENES) s.scenes = s.scenes.slice(0, MAX_SCENES);
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

  // Canonical narrative role, derived once from the free-text purpose (+ position for
  // the unlabelled edge cases). Every downstream decision reads this instead of
  // string-matching `purpose`, which silently excluded any scene the model happened to
  // call "benefit" or "the problem". See services/scene_role.js.
  stampRoles(s.scenes);
  ensureSupportingCopy(s.scenes);

  // Snap total to the target duration. Absorb drift into the last scene first,
  // then spill into earlier scenes if it can't take it all within [1,12], so the
  // total always lands on target instead of failing validation. Starts are then
  // recomputed since redistribution can change non-last durations.
  if (targetDuration && s.scenes.length) {
    const r1 = (n) => Math.round(n * 10) / 10;
    let drift = r1(targetDuration - t);
    for (let guard = 0; Math.abs(drift) >= 0.05 && guard < s.scenes.length * 2; guard++) {
      let moved = false;
      for (let i = s.scenes.length - 1; i >= 0 && Math.abs(drift) >= 0.05; i--) {
        const sc = s.scenes[i];
        // Clamp to the SceneSchema duration cap [1,12]; drift a scene can't absorb
        // spills into earlier scenes (loop above) instead of producing a >12s scene
        // that would fail the schema on the very next validateScript().
        const newDur = Math.min(12, Math.max(1, r1(sc.duration + drift)));
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

    // CONTENT checks. Validation used to be purely arithmetic — ids, gapless starts,
    // duration sum — with exactly one soft warning about VO length. A scene could
    // therefore carry no on-screen copy at all and pass, which is how "many scenes
    // contain little or no text" survived every gate until preflight caught it after
    // the assets were already fetched. The Script Room is where a human can still fix
    // it in one edit, so the complaint belongs here.
    const ost = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter((t) => String(t).trim()) : [];
    const hasVo = !!(scene.voiceover && scene.voiceover.trim());
    if (!ost.length && !hasVo) {
      warnings.push(`scene ${scene.id} (${scene.purpose}) is silent AND has no on-screen text — it will render as an empty template panel`);
    } else if (!ost.length) {
      warnings.push(`scene ${scene.id} (${scene.purpose}) has no on-screen text — the viewer hears the point but never reads it (most social video is watched muted)`);
    } else if (ost.length === 1 && scene.duration >= 4) {
      warnings.push(`scene ${scene.id} (${scene.purpose}) holds a single line for ${scene.duration}s — consider a supporting line so the frame isn't bare`);
    }
  }

  // Film-level shape: a marketing film that never asks for anything is a rare mistake
  // worth surfacing, and a one-scene film is almost always a truncated generation.
  const purposes = s.scenes.map((x) => String(x.purpose || "").toLowerCase());
  if (s.scenes.length >= 3 && !purposes.some((p) => /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p))) {
    warnings.push("no CTA scene — the film ends without asking the viewer to do anything");
  }
  if (s.scenes.length < 2) {
    warnings.push(`only ${s.scenes.length} scene(s) — a single-shot film has no narrative arc and usually means the generation was truncated`);
  }

  const total = Math.round(expectedStart * 10) / 10;
  if (targetDuration && Math.abs(total - targetDuration) > 0.2) {
    errors.push(`scene durations sum to ${total}s; expected ${targetDuration}s`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

const { extractFirstJsonObject: parseLenient } = require("./json_lenient");

async function generateScript({ brief, userAssets, signal, languageDirective = null, product = null }) {
  const targetDuration = brief.suggestedDuration;
  // The user's own uploaded material, classified at intake. The static prompt
  // carries the RULE (7b); the dynamic INVENTORY rides the user message — same
  // split the creative director uses. The script plans showcase scenes around
  // these; it must not re-request them as assetNeeds.
  const inventoryBlock = userAssets && userAssets.inventory
    ? ["", `USER ASSET INVENTORY (rule 7b — build the film around these; they arrive automatically): ${userAssets.inventory}.`]
    : [];
  // Language Director's localization-aware authoring directive (non-English films only; null
  // for English → this block is empty and the payload is byte-identical to before).
  const languageBlock = languageDirective ? ["", languageDirective] : [];
  // PRODUCT UNDERSTANDING (prompt-only jobs). The brief distils it, but two things do not
  // survive distillation and the script needs both: the STATED-vs-INFERRED boundary (which
  // sentences may be spoken as the user's own claim) and the VISUAL VOCABULARY — literal,
  // shootable subjects already ranked by importance. Without the second, `assetNeeds` is
  // written from the writer's imagination and the collector chases prose.
  const productBlock = (() => {
    if (!product) return [];
    const out = ["", require("./product_understanding").describe(product)];
    if (Array.isArray(product.visualVocabulary) && product.visualVocabulary.length) {
      out.push("", "SHOOTABLE VISUALS — draw every `assetNeeds.query` from this list (it is already concrete and on-topic; a query you invent instead will pull generic stock):");
      for (const v of product.visualVocabulary) {
        out.push(`  - "${v.subject}" [${v.assetType}, ${v.priority}]${v.why ? ` — ${v.why}` : ""}`);
      }
    }
    return out;
  })();
  const user = [
    "Creative Brief:",
    JSON.stringify(brief, null, 2),
    ...productBlock,
    ...inventoryBlock,
    ...languageBlock,
    "",
    `Target total duration: ${targetDuration} seconds exactly.`,
    "Write the production script JSON now.",
  ].join("\n");

  let totalIn = 0, totalOut = 0;
  let lastErr = "";
  let userMsg = user;

  // (The 2nd attempt used to escalate to config.llm.scriptEscalationModel. That named an
  // OpenRouter model, and naming any model disables KIE for the call, so the retry left
  // the KIE-first path entirely. Truncated-JSON recovery is chat()'s job — it retries and
  // falls back across providers on exactly that failure.)

  // Who actually served it — chat() may fall back across providers, so the caller can
  // only price this stage correctly if we report the LAST serving (model, provider) pair.
  let servedModel = null, servedBy = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text, tokensIn, tokensOut, model, provider } = await openrouter.chat({
      system: SYSTEM,
      user: userMsg,
      jsonMode: true,
      stage: "script",
      temperature: 0.7,
      signal,
      // Attempt 2 no longer names an escalation model. Passing one disabled KIE for the
      // retry (openrouter.js kieEnabled), making OpenRouter this stage's primary on the
      // second pass — the one place a KIE-first stage still went out through the capped
      // key. The truncation defence it backstopped lives in chat() itself (retry +
      // cross-provider fallback), and the retry still differs meaningfully because
      // userMsg below carries the validation error back to the model.
    });
    totalIn += tokensIn;
    totalOut += tokensOut;
    servedModel = model || servedModel;
    servedBy = provider || servedBy;

    try {
      const raw = normalizeScript(parseLenient(text), { targetDuration });
      const check = validateScript(raw, { targetDuration });
      if (!check.ok) throw new Error(check.errors.join("; "));
      console.log(`[script] ok on attempt ${attempt} (${raw.scenes.length} scenes, ${targetDuration}s, ${check.warnings.length} pace warning(s))`);
      return { script: raw, warnings: check.warnings, tokensIn: totalIn, tokensOut: totalOut, model: servedModel, provider: servedBy };
    } catch (e) {
      lastErr = e.message;
      console.warn(`[script] attempt ${attempt} invalid: ${lastErr.slice(0, 300)}`);
      userMsg = `${user}\n\nYour previous reply failed validation:\n${lastErr.slice(0, 800)}\nReturn ONLY the corrected JSON object.`;
    }
  }

  throw new Error(`script generation failed after 2 attempts: ${lastErr.slice(0, 500)}`);
}

module.exports = { generateScript, validateScript, normalizeScript, ScriptSchema };
