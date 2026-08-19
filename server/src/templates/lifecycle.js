// TEMPLATE LIFECYCLE — the state machine for admin-authored templates.
//
// ONE table, read by three consumers that must never disagree: the store (which refuses an
// illegal write), the admin router (which refuses an illegal request) and the admin UI
// (which only offers the buttons the state actually permits). A second copy of this table
// in the frontend is how "the button was there but the API said 409" happens, so the UI
// reads ACTIONS off the API response instead of re-deriving it.
//
// THE INVARIANT THIS FILE EXISTS TO PROTECT: `PUBLISHED` is the only status that makes a
// template visible to normal users, and it is reachable from exactly one predecessor
// (READY_TO_PUBLISH) through exactly one action (publish). Every other path in is closed.
// Note that status alone does not grant visibility — visibility is a FILESYSTEM fact (which
// root the pack directory lives in; see templates/paths.js). Status and location are moved
// together by the store, so a corrupted lifecycle record can lose a draft's metadata but
// cannot publish it.

const STATUS = Object.freeze({
  DRAFT: "DRAFT",
  GENERATING: "GENERATING",
  GENERATED: "GENERATED",
  TESTING: "TESTING",
  READY_TO_PUBLISH: "READY_TO_PUBLISH",
  PUBLISHED: "PUBLISHED",
  // A version that WAS live and was replaced by a newer one. Not a failure and not a deletion:
  // its pack directory moves back out of frames/ (so users see exactly one version of a family)
  // while the row, its source, its QA report and its issue history all stay — which is what makes
  // a rollback a status change rather than a rebuild.
  SUPERSEDED: "SUPERSEDED",
  FAILED: "FAILED",
  ARCHIVED: "ARCHIVED",
});

const ALL_STATUSES = Object.freeze(Object.values(STATUS));

// The ONLY status whose packs are installed in the public frames/ root.
const PUBLIC_STATUS = STATUS.PUBLISHED;

// status -> the statuses it may move to. Anything not listed is a 409.
const TRANSITIONS = Object.freeze({
  // DRAFT -> GENERATED without passing through GENERATING is the CLONE path, and only
  // service.newVersion performs it: the row's source did not come from a generation, it was
  // copied wholesale from the version it fixes. Stating it here rather than faking a generation
  // keeps "GENERATING" meaning "an LLM call is in flight", which is what the progress stream,
  // the crash recovery and the busy-lock all assume.
  [STATUS.DRAFT]: [STATUS.GENERATING, STATUS.GENERATED, STATUS.FAILED],
  [STATUS.GENERATING]: [STATUS.GENERATED, STATUS.FAILED],
  // A regenerate re-enters GENERATING; a test/QA run enters TESTING.
  [STATUS.GENERATED]: [STATUS.GENERATING, STATUS.TESTING, STATUS.FAILED],
  // QA decides: a clean sweep promotes, a blocking issue drops back to GENERATED so the
  // admin can regenerate or edit. TESTING never promotes straight to PUBLISHED.
  [STATUS.TESTING]: [STATUS.READY_TO_PUBLISH, STATUS.GENERATED, STATUS.FAILED],
  [STATUS.READY_TO_PUBLISH]: [STATUS.PUBLISHED, STATUS.TESTING, STATUS.GENERATING, STATUS.FAILED],
  // Unpublish returns to the last pre-publish state; archive retires it; SUPERSEDED is what a
  // newer version of the same family does to it at the moment that version goes live.
  [STATUS.PUBLISHED]: [STATUS.READY_TO_PUBLISH, STATUS.SUPERSEDED, STATUS.ARCHIVED],
  // ROLLBACK is SUPERSEDED -> PUBLISHED, and it is deliberately a direct edge rather than a trip
  // back through READY_TO_PUBLISH: this version already passed every gate and was already live,
  // so re-running QA to restore it would make the emergency action the slowest one available.
  [STATUS.SUPERSEDED]: [STATUS.PUBLISHED, STATUS.ARCHIVED],
  [STATUS.FAILED]: [STATUS.GENERATING, STATUS.ARCHIVED],
  // Terminal. A retired template is re-entered by creating a NEW VERSION, never by
  // resurrecting the old row — that is what keeps the version history honest.
  [STATUS.ARCHIVED]: [],
});

// The admin actions each status permits. The API enforces this and the UI renders from it,
// so the two can never drift. Mirrors the product spec's per-status action lists.
const ACTIONS = Object.freeze({
  [STATUS.DRAFT]: ["edit", "generate", "delete"],
  [STATUS.GENERATING]: ["cancel"],
  // `reportIssue` belongs on every status an admin can WATCH A FILM from, which is every status
  // that offers `test`. A defect is found by looking at a render, and the render you look at
  // hardest is the one you are about to publish — so refusing to record it on the version under
  // test meant the finding had to be held in someone's head until it went live, or typed against
  // the wrong version. The route never had a status guard; only this table hid the button.
  [STATUS.GENERATED]: ["preview", "test", "edit", "regenerate", "qa", "reportIssue", "delete"],
  [STATUS.TESTING]: ["preview", "cancel"],
  [STATUS.READY_TO_PUBLISH]: ["preview", "test", "qa", "regenerate", "reportIssue", "publish", "delete"],
  // No `edit` and no `regenerate` on a live version — the only way to change a published design
  // is `newVersion`, which clones it into a fresh row and a fresh directory. That is the rule the
  // whole feature rests on, and it is enforced here rather than only in the UI.
  [STATUS.PUBLISHED]: ["preview", "test", "newVersion", "reportIssue", "unpublish", "archive"],
  [STATUS.SUPERSEDED]: ["preview", "test", "newVersion", "reportIssue", "rollback", "archive"],
  [STATUS.FAILED]: ["viewError", "retry", "regenerate", "delete"],
  [STATUS.ARCHIVED]: ["preview", "newVersion"],
});

// Deleting a template removes its source AND its pack directory, so it is refused for
// anything a user could currently be rendering with, and for anything mid-flight.
const DELETABLE = Object.freeze(new Set([STATUS.DRAFT, STATUS.GENERATED, STATUS.READY_TO_PUBLISH, STATUS.FAILED]));

// Statuses whose pack directory lives in the DRAFT root. Everything except PUBLISHED —
// stated as a set rather than `!== PUBLISHED` so a future status has to make the choice
// explicitly instead of inheriting "draft" by omission.
const DRAFT_ROOTED = Object.freeze(new Set([
  STATUS.DRAFT, STATUS.GENERATING, STATUS.GENERATED, STATUS.TESTING,
  STATUS.READY_TO_PUBLISH, STATUS.SUPERSEDED, STATUS.FAILED, STATUS.ARCHIVED,
]));

// Statuses that keep their source and history for good. A superseded version is the thing a
// rollback restores and the thing a regression is diagnosed against, so it is never deletable —
// same rule as PUBLISHED and ARCHIVED, for the same reason.
const RETAINED = Object.freeze(new Set([STATUS.PUBLISHED, STATUS.SUPERSEDED, STATUS.ARCHIVED]));

function isStatus(s) { return ALL_STATUSES.includes(String(s || "")); }

function canTransition(from, to) {
  if (!isStatus(from) || !isStatus(to)) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`illegal template transition ${from} -> ${to}`);
    err.code = "ILLEGAL_TRANSITION";
    err.status = 409;
    throw err;
  }
}

function actionsFor(status) { return ACTIONS[status] || []; }

function canDelete(status) { return DELETABLE.has(status) && !RETAINED.has(status); }

// Where a record's pack directory belongs, as a root KIND ("published" | "draft").
// The store moves the directory whenever this answer changes.
function rootKindFor(status) {
  return status === PUBLIC_STATUS ? "published" : "draft";
}

module.exports = {
  STATUS, ALL_STATUSES, PUBLIC_STATUS, TRANSITIONS, ACTIONS, DRAFT_ROOTED, RETAINED,
  isStatus, canTransition, assertTransition, actionsFor, canDelete, rootKindFor,
};
