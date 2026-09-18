// VIDEO EDIT ERRORS — one error type for the whole AI Video Edit subsystem.
//
// WHY THIS EXISTS. The engine has to decide, for every failure, whether to retry (transient),
// fall back to the next provider (provider), park the project for a human (resource / config /
// budget), fail it for good (input) or treat it as our own defect (bug). A plain Error carries
// none of that, so every call site would re-derive it from message strings. EditError carries
// the decision with the failure: `errorClass`, `retryable`, `stage`, an HTTP `status` for routes
// and a `userMessage` that is safe to show (never a path, filename, key or transcript text).
//
// CONTRACT (ENGINE.md §5.1, API.md §9):
//   new EditError(code, { status=500, errorClass='bug', retryable=false, stage=null, detail=null,
//                          userMessage=null, extra=null })
//   isEditError(e) -> boolean
//   toErrorBody(e, requestId) -> { error, message, details?, retryable, requestId }
// `detail` is internal diagnostics (stderr tail, etc.) and is NEVER put in an HTTP body.

const ERROR_CLASSES = Object.freeze(["transient", "provider", "resource", "input", "config", "budget", "bug", "cancelled"]);

const DEFAULT_MESSAGES = Object.freeze({
  AUTH_REQUIRED: "Sign in to use AI video editing.",
  ORIGIN_NOT_ALLOWED: "This request came from a site that is not allowed.",
  MEDIA_TOKEN_INVALID: "This media link has expired.",
  NOT_FOUND: "Not found.",
  REVISION_CONFLICT: "The edit changed in another tab; reload and try again.",
  ILLEGAL_TRANSITION: "That action is not possible in the project's current state.",
  NOTHING_TO_CANCEL: "Nothing is running.",
  NOT_READY: "Not ready yet.",
  FILE_TOO_LARGE: "The file is too large.",
  BODY_TOO_LARGE: "The request is too large.",
  UNSUPPORTED_MEDIA: "Not a supported video.",
  VALIDATION_FAILED: "Some settings are invalid.",
  CONSENT_REQUIRED: "Consent to third-party AI processing is required.",
  INVALID_OP: "That edit could not be applied.",
  NOT_RETRYABLE: "This project cannot be retried.",
  MEDIA_REJECTED: "Not a supported video.",
  PROJECT_LOCKED: "The project is busy; try again in a moment.",
  RATE_LIMITED: "Too many requests; slow down.",
  QUOTA_EXCEEDED: "You have reached your AI edit quota.",
  DAILY_CAP_REACHED: "Today's AI edit capacity is used up.",
  AI_BUDGET_EXHAUSTED: "The AI budget for this project is used up.",
  EDITS_DISABLED: "AI video editing is unavailable right now.",
  INSUFFICIENT_STORAGE: "The server is low on storage.",
  STALE_RUN: "A newer run owns this project.",
  STORE_CORRUPT: "The project record is damaged.",
  PATH_ESCAPE: "Invalid path.",
  PROC_TIMEOUT: "A processing step took too long.",
  PROC_STALL: "A processing step stopped making progress.",
  PROC_ABORTED: "Processing was cancelled.",
  PROC_EXIT: "A processing step failed.",
  PROC_SPAWN: "A processing tool is unavailable.",
});

class EditError extends Error {
  constructor(code, { status = 500, errorClass = "bug", retryable = false, stage = null, detail = null, userMessage = null, extra = null } = {}) {
    const c = String(code || "INTERNAL");
    super(userMessage || DEFAULT_MESSAGES[c] || c);
    this.name = "EditError";
    this.code = c;
    this.status = Number.isInteger(status) ? status : 500;
    this.errorClass = ERROR_CLASSES.includes(errorClass) ? errorClass : "bug";
    this.retryable = !!retryable;
    this.stage = stage || null;
    // Internal only; capped so a runaway stderr can never bloat project.json.
    this.detail = detail == null ? null : String(detail).slice(-600);
    this.userMessage = userMessage || DEFAULT_MESSAGES[c] || null;
    this.extra = extra && typeof extra === "object" ? extra : null;
  }
}

function isEditError(e) {
  return !!e && (e instanceof EditError || e.name === "EditError") && typeof e.code === "string";
}

// HTTP error body. Unknown errors are reported as INTERNAL without their message — a raw
// Error message can hold a path or provider response, and the client never needs it.
function toErrorBody(e, requestId = null) {
  if (isEditError(e)) {
    const body = {
      error: e.code,
      message: e.userMessage || DEFAULT_MESSAGES[e.code] || "Request failed.",
      retryable: !!e.retryable,
      requestId: requestId || null,
    };
    if (e.extra && Object.keys(e.extra).length) body.details = { ...e.extra };
    return body;
  }
  return { error: "INTERNAL", message: "Something went wrong.", retryable: false, requestId: requestId || null };
}

module.exports = { EditError, isEditError, toErrorBody, ERROR_CLASSES, DEFAULT_MESSAGES };
