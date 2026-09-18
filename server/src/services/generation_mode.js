// GENERATION MODE — the one place that names KEYFRAME's two production modes.
//
// WHY THIS EXISTS. KEYFRAME used to have exactly one way to make a video (prompt/URL → template
// composition), so nothing recorded WHICH way a piece of work was made. AI Video Edit adds the
// opposite direction (upload raw footage → edited video) as a separate subsystem with its own
// store. Health checks, dev-watch, metrics and the web client need to tell the two apart without
// string literals scattered across both codebases, and without the template pipeline learning
// anything about edits. `web/src/modes.js` mirrors these constants.
//
// CONTRACT (ENGINE.md §1):
//   GENERATION_MODES = frozen { TEMPLATE_GENERATION, AI_VIDEO_EDIT }
//   modeOfJob(job) -> one of GENERATION_MODES. Every template job kind ("generate", "project",
//   a missing kind, or null) is TEMPLATE_GENERATION; only a record that says it is an edit
//   (mode AI_VIDEO_EDIT, or a `ve_` project id) is AI_VIDEO_EDIT. Never throws.

const GENERATION_MODES = Object.freeze({
  TEMPLATE_GENERATION: "TEMPLATE_GENERATION",
  AI_VIDEO_EDIT: "AI_VIDEO_EDIT",
});

const EDIT_ID_RE = /^ve_[0-9a-z]{16}$/;

function modeOfJob(job) {
  if (!job || typeof job !== "object") return GENERATION_MODES.TEMPLATE_GENERATION;
  if (job.mode === GENERATION_MODES.AI_VIDEO_EDIT) return GENERATION_MODES.AI_VIDEO_EDIT;
  const id = typeof job.id === "string" ? job.id : (typeof job.jobId === "string" ? job.jobId : "");
  if (EDIT_ID_RE.test(id)) return GENERATION_MODES.AI_VIDEO_EDIT;
  // "generate" (prompt/URL), "project" (intake → approval → production) and legacy rows with
  // no kind are all template generation — jobs.json never holds an edit.
  return GENERATION_MODES.TEMPLATE_GENERATION;
}

module.exports = Object.freeze({ GENERATION_MODES, modeOfJob });
