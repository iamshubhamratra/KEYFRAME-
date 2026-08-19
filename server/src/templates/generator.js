// TEMPLATE GENERATOR — admin prompt -> validated TemplateSpec.
//
// One LLM stage (`template_designer`) plus a repair loop. The repair loop is the part that
// matters: this is the most structurally demanding JSON stage in the app (~40 constrained
// fields, seven per-beat look tables, a six-camera set, and a colour system that has to clear a
// contrast gate), and the overwhelmingly common failure is not a bad design — it is a good
// design with two roles that do not quite clear 4.5:1, or one field outside its enum. Throwing
// that away and regenerating from scratch costs a full call and usually reintroduces a
// different version of the same slip. Re-sending the spec WITH the validator's exact complaints
// fixes it in one cheap lap.
//
// The generator never writes a file. It returns a spec; templates/emit.js compiles it. That
// split is what keeps the safety boundary legible: everything up to here is untrusted model
// output, everything after it is data that has passed a schema and a cross-check.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const openrouter = require("../services/openrouter");
const { extractFirstJsonObject } = require("../services/json_lenient");
const { validateSpec } = require("./spec");

const SYSTEM = fs.readFileSync(path.join(__dirname, "..", "prompts", "system_template_designer.md"), "utf8");

// BOTH ASPECTS, VIA THE STAGE THE SKIN DECLARES.
//
// The engine used to be portrait-only: film_stage stated `const RW = 1080, RH = 1920` at module
// scope and film_beats wrote raw pixel geometry against it, so a landscape render inflated every
// height while shrinking the room for it. RW/RH are now set per build from `SKIN.stage`, and
// film_beats carries a WIDE layout family that lays each beat out ACROSS the frame instead of
// down it. A portrait skin is unaffected — it declares no stage, resolves to 1080x1920, and all
// 89 shipped packs remain byte-identical (scripts/golden-composers.js).
//
// The job vocabulary (horizontal|vertical|square) and the pack vocabulary
// (landscape|portrait|square) are the project's existing pair; this maps between them rather
// than inventing a third.
const ORIENTATION_TO_STAGE = {
  vertical: "portrait", portrait: "portrait",
  horizontal: "landscape", landscape: "landscape",
};
const SUPPORTED_ORIENTATIONS = new Set(Object.keys(ORIENTATION_TO_STAGE));
const ORIENTATION_REFUSAL =
  "This generator authors 9:16 (portrait) and 16:9 (landscape) templates. Square (1:1) has no "
  + "authored stage in this engine — pick one of the two, or add a square stage to "
  + "film_stage.STAGES and a matching layout family to film_beats first.";

// Returns the PACK-vocabulary stage for a job-vocabulary orientation.
function assertOrientationSupported(orientation) {
  const o = String(orientation || "vertical").toLowerCase();
  const stage = ORIENTATION_TO_STAGE[o];
  if (!stage) {
    const e = new Error(ORIENTATION_REFUSAL);
    e.code = "ORIENTATION_UNSUPPORTED";
    e.status = 400;
    throw e;
  }
  return stage;
}

// The admin's brief, rendered as the user turn. Everything optional is omitted rather than sent
// as an empty string — a field that says "Style:" with nothing after it reads to the model as a
// deliberate blank and measurably flattens the output.
function buildUserMessage({ name, prompt, options = {}, existingSpec = null, feedback = null, stage = "portrait" }) {
  const wide = stage === "landscape";
  const L = [];
  L.push(`Design a KEYFRAME template named "${name}".`);
  L.push("");
  L.push("## What the admin asked for");
  L.push(String(prompt || "").trim());
  L.push("");
  L.push("## Stage");
  // Stated as its own section, and repeated in concrete numbers, because every `top` and `size`
  // in the answer is in pixels of THIS frame — the single most common way a generated spec comes
  // back wrong is authoring portrait numbers for a landscape stage.
  L.push(`- \`"stage": "${stage}"\` — you MUST set this field to exactly that value.`);
  L.push(wide
    ? "- The frame is **1920 x 1080 (16:9, landscape)**. Every `top` is a position in a 1080px-tall"
      + " frame, so keep them under ~880. Beats lay out ACROSS the frame: the copy takes one column"
      + " and the imagery sits beside it, so headlines wrap to roughly half the width — favour"
      + " shorter `size` values (90-150) than you would for portrait, and expect 2-3 lines."
    : "- The frame is **1080 x 1920 (9:16, portrait)**. Every `top` is a position in a 1920px-tall"
      + " frame. Beats stack: copy above, imagery below.");

  const opt = [];
  if (options.category) opt.push(`- Category: ${options.category}`);
  if (options.style) opt.push(`- Style direction: ${options.style}`);
  if (Array.isArray(options.tags) && options.tags.length) opt.push(`- Tags to honour: ${options.tags.join(", ")}`);
  if (options.brandColor) {
    opt.push(`- Anchor colour: ${options.brandColor}. Build the palette AROUND this colour — it should`
      + ` be one of your accent roles, not an afterthought. Everything else must still clear the`
      + ` contrast floors against it.`);
  }
  if (options.description) opt.push(`- Description to live up to: ${options.description}`);
  if (options.duration) opt.push(`- Typical film length: ${options.duration}s (${Number(options.duration) <= 20 ? "short — favour bold, fast-reading type" : "long enough for a full six-beat arc"})`);
  if (options.instructions) opt.push(`- Additional design instructions: ${options.instructions}`);
  if (opt.length) { L.push(""); L.push("## Constraints"); L.push(...opt); }

  L.push("");
  L.push(`Set "label" to exactly "${name}".`);

  // A CARRIED DESIGN IS A REVISION WHETHER OR NOT ANYONE TYPED FEEDBACK.
  //
  // This used to be `existingSpec && feedback`, which quietly defeated the thing service.js:61-67
  // was written to guarantee. That caller passes the parent's spec whenever a row has a parentId
  // — "a version created to fix another one is always a revision" — and then this gate threw the
  // spec away because the admin had not typed anything into a feedback box the screen does not
  // even render. The result: pressing Generate on v2 designed a brand-new template from the
  // prompt, so the version created to fix a defect shared nothing with the version that had it.
  //
  // Carrying the design is the whole point of a version. Feedback narrows what to change; its
  // absence means "keep this design and rebuild it", never "start again".
  if (existingSpec) {
    L.push("");
    L.push("## This is a REVISION");
    L.push("Here is the current design. Keep it. Change only what is asked for below and leave the");
    L.push("rest alone — a revision that redesigns everything is a regression, not an improvement.");
    if (feedback) {
      L.push("");
      L.push("WHAT MUST CHANGE: " + String(feedback));
    } else {
      L.push("");
      L.push("Nothing specific was asked for, so preserve this design exactly and re-emit it.");
    }
    L.push("");
    L.push("CURRENT DESIGN:");
    L.push(JSON.stringify(existingSpec));
  }

  L.push("");
  L.push("Return one JSON object. No prose, no markdown fence.");
  return L.join("\n");
}

// The repair turn. Deliberately terse and mechanical: the model already has the design in
// context, and the only new information is what a deterministic validator objected to. Framing
// it as a list of exact complaints ("this field, this value, this rule") repairs far more
// reliably than asking it to "fix the errors".
function buildRepairMessage(spec, errors) {
  return [
    "The design you returned failed validation. Fix ONLY these problems and return the COMPLETE",
    "corrected JSON object — same design, same intent, minimal edits.",
    "",
    ...errors.map((e) => `- ${e}`),
    "",
    "Reminders that cover most of these:",
    "- Every colour field names a role defined in `palette` — never a hex, never a role you did not define.",
    "- fg on bg must be at least 4.5:1; hi on bg at least 3:1. Check EVERY beat separately: beats swap",
    "  ground, so a pairing that works on the dark beats can fail on the light one. If a pairing is too",
    "  close, change the ROLE you reference rather than nudging the hex — the palette is a system.",
    "- At least one beat with world:true and at least one with world:false.",
    "- Fonts must come from the bundled list.",
    "",
    "YOUR CURRENT DESIGN:",
    JSON.stringify(spec),
  ].join("\n");
}

// Generate a spec. Returns { spec, usage: {tokensIn, tokensOut, model, provider}, laps, warnings }.
// Throws with .code = "ORIENTATION_UNSUPPORTED" | "SPEC_INVALID" | "NO_JSON".
async function generateSpec({ name, prompt, orientation = "vertical", options = {}, existingSpec = null, feedback = null, signal, onProgress }) {
  const stage = assertOrientationSupported(orientation);
  if (!String(prompt || "").trim()) {
    const e = new Error("a generation prompt is required");
    e.code = "NO_PROMPT";
    e.status = 400;
    throw e;
  }

  const maxRepairs = Math.max(0, Number(config.templateDesigner?.maxRepairs ?? 2));
  let user = buildUserMessage({ name, prompt, options, existingSpec, feedback, stage });
  let tokensIn = 0, tokensOut = 0, servedModel = null, servedBy = null;
  let lastErrors = [];
  let lastSpec = null;

  for (let lap = 0; lap <= maxRepairs; lap++) {
    if (onProgress) onProgress(lap === 0 ? "designing" : `repairing (lap ${lap})`);

    const res = await openrouter.chat({
      // No explicit `model`: that would pin the call with no fallback behind it. config.js
      // mirrors templateDesigner.model into llm.primary.stageModels, which is what routes
      // this stage.
      system: SYSTEM, user, jsonMode: true, stage: "template_designer",
      // Low but not zero. This stage is a DESIGN task — at 0 every prompt converges on the same
      // dark-blue-with-one-cyan-accent template, which defeats the purpose of a library.
      temperature: 0.7, signal,
    });
    tokensIn += res.tokensIn || 0;
    tokensOut += res.tokensOut || 0;
    servedModel = res.model; servedBy = res.provider;

    const raw = extractFirstJsonObject(res.text);
    if (!raw) {
      lastErrors = ["the model did not return a parseable JSON object"];
      // A truncated or prose-wrapped answer is not repairable by pointing at fields — re-ask.
      // `stage` MUST be re-sent. Omitting it defaults buildUserMessage to "portrait", so a
      // landscape template whose first lap returned unparseable JSON was silently re-briefed as a
      // portrait one — and nothing downstream caught it: spec.stage defaults to portrait, crossCheck
      // derives its geometry ceiling from that same field, and packFor writes the manifest from the
      // skin, so the pack, the QA probe and the composed film all agreed with each other and
      // disagreed only with the orientation the admin actually chose.
      user = buildUserMessage({ name, prompt, options, existingSpec, feedback, stage })
        + "\n\nYour previous answer was not valid JSON. Return ONE JSON object and nothing else.";
      continue;
    }

    // The admin named the template; the model does not get to rename it.
    if (name) raw.label = String(name).slice(0, 48);

    const v = validateSpec(raw);
    // THE BELT TO THE ABOVE BRACES. Re-sending `stage` fixes the one path that dropped it, but the
    // failure it caused was invisible precisely because every consumer reads the stage off the SPEC
    // rather than off the request — so a wrong answer is self-consistent all the way to the render.
    // Assert the model returned the aspect that was asked for, and route a mismatch through the
    // ordinary repair loop.
    if (v.ok && v.spec.stage !== stage) {
      lastSpec = raw;
      lastErrors = [`stage: you returned "${v.spec.stage}" but this template is ${stage} — set "stage" to exactly "${stage}" and author every top/size against that frame`];
      user = buildRepairMessage(raw, lastErrors);
      continue;
    }
    if (v.ok) {
      return {
        spec: v.spec,
        usage: { tokensIn, tokensOut, model: servedModel, provider: servedBy },
        laps: lap,
        warnings: [],
      };
    }
    lastSpec = raw;
    lastErrors = v.errors;
    user = buildRepairMessage(raw, v.errors);
  }

  const e = new Error(`the designed template did not pass validation after ${maxRepairs} repair lap(s):\n- ${lastErrors.join("\n- ")}`);
  e.code = "SPEC_INVALID";
  e.status = 422;
  e.errors = lastErrors;
  e.spec = lastSpec;
  e.usage = { tokensIn, tokensOut, model: servedModel, provider: servedBy };
  throw e;
}

module.exports = {
  generateSpec, buildUserMessage, buildRepairMessage,
  assertOrientationSupported, SUPPORTED_ORIENTATIONS, ORIENTATION_REFUSAL,
};
