// VIDEO EDIT CONSTANTS — status and stage names shared by the store, faults and progress.
//
// WHY THIS EXISTS. store.js, faults.js and engine/progress.js all need the same status and stage
// vocabulary (ENGINE.md §3.3). Keeping them in a dependency-free module stops a require cycle
// (the store must never require faults; faults validates `crash:<STAGE>` tokens) and makes a
// renamed stage fail loudly everywhere at once. store.js re-exports these as its public contract.

const STATUSES = Object.freeze([
  "QUEUED", "PROCESSING", "READY", "RENDERING", "COMPLETED", "NEEDS_ATTENTION", "CANCELLED", "FAILED", "DELETING",
]);

// Statuses that hold (or are waiting for) engine capacity. dev-watch defers restarts on these.
const ACTIVE_STATUSES = Object.freeze(["QUEUED", "PROCESSING", "RENDERING"]);

// User-facing stage names in pipeline order, excluding UPLOAD (client-side) and COMPLETED (terminal).
const STAGES = Object.freeze([
  "VALIDATING", "COMPRESSING", "EXTRACTING_AUDIO", "TRANSCRIBING", "ANALYZING_VIDEO", "ANALYZING_CONTENT",
  "SEARCHING_BROLL", "SCORING_ASSETS", "BUILDING_EDIT_PLAN", "PREPARING_RENDER", "RENDERING", "POST_PROCESSING",
  "QUALITY_CHECK",
]);

const STAGE_STATUSES = Object.freeze(["pending", "running", "done", "failed", "skipped", "interrupted"]);

module.exports = { STATUSES, ACTIVE_STATUSES, STAGES, STAGE_STATUSES };
