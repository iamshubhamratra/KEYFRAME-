// STUDIO MODES — which of KEYFRAME's two products the person is in.
//
// "Make a film" (TEMPLATE_GENERATION) is the prompt → script → render studio; "Edit my video"
// (AI_VIDEO_EDIT) edits footage the person recorded. The mode is DERIVED from App's view, never
// stored, so a deep link, a back button and a nav chip can never disagree about where you are.

export const GENERATION_MODES = Object.freeze({
  TEMPLATE_GENERATION: "TEMPLATE_GENERATION",
  AI_VIDEO_EDIT: "AI_VIDEO_EDIT",
});

// App views that belong to each mode. Views outside both lists (landing, gallery, auth, admin)
// have no studio mode.
export const TEMPLATE_VIEWS = Object.freeze(["create", "understanding", "script", "theater", "premiere"]);
export const AI_EDIT_VIEWS = Object.freeze(["aiUpload", "aiEdit", "aiEdits"]);

export const MODE_LABELS = Object.freeze({
  [GENERATION_MODES.TEMPLATE_GENERATION]: "Make a film",
  [GENERATION_MODES.AI_VIDEO_EDIT]: "Edit my video",
});

// The view each mode opens on when chosen from the ModeSwitch.
export const MODE_ENTRY_VIEW = Object.freeze({
  [GENERATION_MODES.TEMPLATE_GENERATION]: "create",
  [GENERATION_MODES.AI_VIDEO_EDIT]: "aiUpload",
});

export function modeForView(view) {
  if (AI_EDIT_VIEWS.includes(view)) return GENERATION_MODES.AI_VIDEO_EDIT;
  if (TEMPLATE_VIEWS.includes(view)) return GENERATION_MODES.TEMPLATE_GENERATION;
  return null;
}

export const isAiEditView = (view) => AI_EDIT_VIEWS.includes(view);
