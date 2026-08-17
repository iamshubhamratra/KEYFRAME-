// BATCH DESIGN STRATEGY — N genuinely different creative directions, decided before anything is
// generated.
//
// WHY THIS EXISTS AS A SEPARATE STEP. Asking the designer model for "another template like the
// brief" ten times produces ten variations of whatever it reached for first: the same stacked
// composition and camera cycle with a new accent colour. It has no memory between calls and no
// view of what it already made.
//
// So the batch is PLANNED first. One call decides all N directions at once — which is the only
// arrangement in which the model can deliberately make them differ from each other — and each
// direction then becomes the design brief for one ordinary single-template generation. Nothing
// downstream changes: templates/generator.js is called exactly as the single-template path calls
// it, with a richer prompt.
//
// THE PLAN IS STRUCTURAL, NOT PROSE. Every direction must commit to concrete choices from the
// engine's own vocabulary (entrance preset, camera set, world layer kinds, ground treatment,
// picture geometry, mechanic). That matters because templates/fingerprint.js measures diversity
// along those same axes: a plan written only in adjectives ("bold", "editorial") cannot be checked
// and reliably collapses into the same design. Committing the plan to engine vocabulary is what
// makes the uniqueness gate downstream a test the plan can actually pass.

const openrouter = require("../services/openrouter");

// The engine's real vocabularies, restated here so the plan can only choose things that exist.
// These mirror templates/spec.js — a direction naming a preset the engine does not have would be
// silently dropped by the designer model and the plan would have promised diversity it never
// delivered.
const PRESETS = ["rise", "fade", "drop", "slide", "scale", "blur", "mask", "typewriter", "stagger", "flip"];
const CAMERAS = ["drop", "pushL", "pushR", "pushU", "pushD", "zoomIn", "zoomOut", "drift", "orbit", "tilt"];
const WORLD_KINDS = ["glow", "stars", "motes", "grid", "wave", "rings", "stripes", "orb", "arcs", "beam"];
const GROUNDS = ["flat", "linear", "radial", "conic"];

// A direction is a name, a one-line identity, a design brief, and the structural commitments.
const SCHEMA_HINT = `{
  "directions": [
    {
      "name": "Two or three words. A real name — Prism Motion, Editorial Flow, Orbit Studio. Never 'Template 1'.",
      "identity": "One sentence naming what makes this template unlike the others in this batch.",
      "brief": "3-5 sentences of art direction: composition, typography treatment, how pictures are placed, how motion behaves, what the backdrop does. Concrete and visual.",
      "category": "one of the product's categories, e.g. Technology",
      "tags": ["4-8 lowercase tags"],
      "structure": {
        "titlePreset": "one of ${PRESETS.join("|")}",
        "itemPreset": "one of ${PRESETS.join("|")}",
        "cameras": ["exactly 6 from ${CAMERAS.join("|")}"],
        "worldKinds": ["1-3 from ${WORLD_KINDS.join("|")}"],
        "ground": "one of ${GROUNDS.join("|")}",
        "dark": true,
        "energy": "low|medium|high",
        "featureBox": "small|medium|full-bleed",
        "typeScale": "restrained|balanced|oversized"
      }
    }
  ]
}`;

const SYSTEM = `You are the art director for a video template LIBRARY.

You are given a brief and a number N. You return N creative directions that will each become one
animated video template. Your ONLY job is to make them genuinely different from one another.

WHAT "DIFFERENT" MEANS HERE. These templates share one rendering engine, so they will always share
a beat structure. The design is everything else: where copy sits in the frame, how large the type
is relative to the picture, which face pair carries it, whether the ground is dark or light and
whether it changes between beats, how the camera moves, what the animated backdrop does, how big
the pictures are and how they are framed, and how fast everything arrives. Two directions that
differ only in colour are the SAME direction and are a failure of this task.

Spread the batch deliberately across those axes. If one direction is oversized type on a flat dark
ground with a still camera, another should be restrained type on a light ground with a moving one.
Do not give every direction your favourite entrance preset. Vary the structural commitments as
hard as you vary the prose — they are what the diversity check measures.

Each direction must be a template someone would deliberately choose: it needs a point of view, a
name a person would say out loud, and a clear idea of the film it makes.

Return ONE JSON object, no prose, in exactly this shape:
${SCHEMA_HINT}`;

function buildUser({ count, config }) {
  const c = config || {};
  const L = [];
  L.push(`N = ${count}. Return exactly ${count} directions.`);
  L.push(`Orientation: ${c.orientation === "landscape" ? "16:9 landscape" : "9:16 portrait"}.`);
  if (c.style) L.push(`Overall style: ${c.style}.`);
  if (c.category) L.push(`Category: ${c.category}.`);
  if (c.industry) L.push(`Target industry: ${c.industry}.`);
  if (c.animation) L.push(`Animation intensity: ${c.animation}.`);
  if (c.colorDirection) L.push(`Colour direction: ${c.colorDirection}.`);
  if (c.duration) L.push(`Typical film length: ${c.duration} seconds.`);
  if (c.instructions) L.push(`Additional instruction from the admin: ${c.instructions}`);

  // LIBRARY AWARENESS, AS TEXT. The uniqueness gate compares against the installed library
  // numerically; telling the planner what is already there stops it proposing the obvious thing
  // that exists ten times over, which is cheaper than rejecting it afterwards.
  if (Array.isArray(c.existingNames) && c.existingNames.length) {
    L.push("");
    L.push(`The library ALREADY contains these templates — do not propose anything that would sit beside them as a near-duplicate: ${c.existingNames.slice(0, 60).join(", ")}.`);
  }
  if (Array.isArray(c.overusedTraits) && c.overusedTraits.length) {
    L.push(`These treatments are already over-represented in the library; use them sparingly and never as the identity of a direction: ${c.overusedTraits.join(", ")}.`);
  }
  return L.join("\n");
}

const pick = (v, allowed, fallback) => (allowed.includes(String(v)) ? String(v) : fallback);

// Normalise whatever the model returned into exactly `count` well-formed directions. A plan that
// is short, malformed, or repeats itself is repaired here rather than failing the batch: the
// direction is a BRIEF, and a slightly weaker brief still produces a template the uniqueness gate
// will judge on its merits.
function normalise(raw, count, config) {
  const list = Array.isArray(raw && raw.directions) ? raw.directions : [];
  const out = [];
  const usedNames = new Set();
  for (const d of list) {
    if (out.length >= count) break;
    const name = String((d && d.name) || "").trim().slice(0, 48);
    if (!name || usedNames.has(name.toLowerCase())) continue;
    usedNames.add(name.toLowerCase());
    const st = (d && d.structure) || {};
    out.push({
      name,
      identity: String((d && d.identity) || "").slice(0, 400),
      brief: String((d && d.brief) || "").slice(0, 2000),
      category: String((d && d.category) || config.category || "Animated").slice(0, 40),
      tags: Array.isArray(d && d.tags) ? d.tags.map((t) => String(t).toLowerCase().slice(0, 24)).slice(0, 8) : [],
      structure: {
        titlePreset: pick(st.titlePreset, PRESETS, PRESETS[out.length % PRESETS.length]),
        itemPreset: pick(st.itemPreset, PRESETS, PRESETS[(out.length + 3) % PRESETS.length]),
        cameras: Array.isArray(st.cameras) ? st.cameras.map(String).filter((c) => CAMERAS.includes(c)).slice(0, 6) : [],
        worldKinds: Array.isArray(st.worldKinds) ? st.worldKinds.map(String).filter((k) => WORLD_KINDS.includes(k)).slice(0, 3) : [],
        ground: pick(st.ground, GROUNDS, GROUNDS[out.length % GROUNDS.length]),
        dark: typeof st.dark === "boolean" ? st.dark : out.length % 2 === 0,
        energy: pick(st.energy, ["low", "medium", "high"], config.animation || "medium"),
        featureBox: pick(st.featureBox, ["small", "medium", "full-bleed"], ["medium", "full-bleed", "small"][out.length % 3]),
        typeScale: pick(st.typeScale, ["restrained", "balanced", "oversized"], ["balanced", "oversized", "restrained"][out.length % 3]),
      },
    });
  }

  // SHORTFALL IS FILLED STRUCTURALLY, NOT BY REPEATING. If the model returned six directions for a
  // batch of ten, the remaining four are rotated deliberately through the vocabularies so they at
  // least differ mechanically — and they are marked `synthesised`, so the batch report never
  // claims a planned direction it did not get.
  for (let i = out.length; i < count; i++) {
    out.push({
      name: `Direction ${i + 1}`,
      identity: "Filled in by the planner after a short answer — this direction was rotated through the engine's vocabularies rather than art-directed.",
      brief: `A ${config.style || "modern"} template that deliberately differs from the rest of this batch in composition and motion.`,
      category: config.category || "Animated",
      tags: [],
      synthesised: true,
      structure: {
        titlePreset: PRESETS[i % PRESETS.length],
        itemPreset: PRESETS[(i + 4) % PRESETS.length],
        cameras: [],
        worldKinds: [WORLD_KINDS[i % WORLD_KINDS.length]],
        ground: GROUNDS[i % GROUNDS.length],
        dark: i % 2 === 0,
        energy: config.animation || "medium",
        featureBox: ["medium", "full-bleed", "small"][i % 3],
        typeScale: ["balanced", "oversized", "restrained"][i % 3],
      },
    });
  }
  return out.slice(0, count);
}

/** Plan a batch: one model call, N directions out. */
async function planBatch({ count, config = {}, signal = null }) {
  const n = Math.max(1, Math.min(50, Number(count) || 1));
  const res = await openrouter.chat({
    system: SYSTEM,
    user: buildUser({ count: n, config }),
    jsonMode: true,
    stage: "template_designer",
    // Higher than the per-template call (0.7). This step's whole job is spread; converging is the
    // one failure mode that matters here.
    temperature: 0.9,
    maxTokens: 8000,
    signal,
  });
  let raw = null;
  try { raw = JSON.parse(res.text); }
  catch {
    const m = /\{[\s\S]*\}/.exec(String(res.text || ""));
    try { raw = m ? JSON.parse(m[0]) : null; } catch { raw = null; }
  }
  return {
    directions: normalise(raw, n, config),
    usage: { tokensIn: res.tokensIn || 0, tokensOut: res.tokensOut || 0, model: res.model, provider: res.provider },
  };
}

/**
 * The per-template prompt: the admin's brief, plus THIS direction's art direction, plus whatever
 * the uniqueness gate said about the previous attempt. Built here so the batch never sends the
 * same prompt twice — which is the single easiest way to get the same template twice.
 */
function briefFor({ direction, config = {}, rejection = null }) {
  const c = config || {};
  const st = direction.structure || {};
  const L = [];
  L.push(c.instructions || `A ${c.style || "modern"} animated template${c.category ? ` for ${c.category}` : ""}.`);
  L.push("");
  L.push(`DESIGN DIRECTION — "${direction.name}"`);
  if (direction.identity) L.push(direction.identity);
  if (direction.brief) L.push(direction.brief);
  L.push("");
  L.push("STRUCTURAL COMMITMENTS for this template (follow them; they are what make it unlike its siblings):");
  L.push(`- title entrance: ${st.titlePreset}; item entrance: ${st.itemPreset}`);
  if (st.cameras && st.cameras.length) L.push(`- camera set: ${st.cameras.join(", ")}`);
  if (st.worldKinds && st.worldKinds.length) L.push(`- animated backdrop built from: ${st.worldKinds.join(", ")}`);
  L.push(`- ground treatment: ${st.ground}, ${st.dark ? "dark" : "light"}`);
  L.push(`- motion energy: ${st.energy}`);
  L.push(`- hero picture: ${st.featureBox} (declare it through the \`boxes\` field)`);
  L.push(`- display type: ${st.typeScale}`);
  if (c.industry) L.push(`- audience: ${c.industry}`);

  // A REJECTION IS THE MOST USEFUL BRIEF THERE IS. It names the exact dimensions on which this
  // attempt collided with an existing template, in the same vocabulary the design is authored in.
  if (rejection && rejection.notes && rejection.notes.length) {
    L.push("");
    L.push(`YOUR PREVIOUS ATTEMPT WAS REJECTED as too close to an existing template (${rejection.similarity}% similar to "${rejection.nearest && rejection.nearest.name}").`);
    L.push(`Change these specifically: ${rejection.notes.join("; ")}.`);
    L.push("Keep the direction's identity — change the execution: different face pair, different ground lightness, different camera set, different entrance, different picture geometry.");
  }
  return L.join("\n");
}

module.exports = { planBatch, briefFor, normalise, PRESETS, CAMERAS, WORLD_KINDS, GROUNDS };
