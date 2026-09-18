// Unit tests for services/generation_mode.js.
// Run: node scripts/generation_mode.test.cjs
//
// The load-bearing assertion is that EVERY template job shape maps to TEMPLATE_GENERATION: the
// template pipeline must never be mistaken for an edit, and the constants must be impossible to
// mutate at runtime (both the module and the nested map are frozen).

const assert = require("node:assert");
const { createHarness } = require("./lib/video_edit_test_utils.cjs");
const GM = require("../src/services/generation_mode");

const { t, section, run } = createHarness();

section("generation_mode — constants");

t("exports exactly the two modes, spelled as their own values", () => {
  assert.deepEqual(Object.keys(GM.GENERATION_MODES).sort(), ["AI_VIDEO_EDIT", "TEMPLATE_GENERATION"]);
  for (const [k, v] of Object.entries(GM.GENERATION_MODES)) assert.equal(k, v);
});

t("module and nested map are frozen", () => {
  assert.ok(Object.isFrozen(GM));
  assert.ok(Object.isFrozen(GM.GENERATION_MODES));
  "use strict";
  const before = GM.GENERATION_MODES.AI_VIDEO_EDIT;
  try { GM.GENERATION_MODES.AI_VIDEO_EDIT = "X"; } catch { /* strict-mode throw is fine */ }
  try { GM.GENERATION_MODES.NEW_MODE = "Y"; } catch { /* noop */ }
  assert.equal(GM.GENERATION_MODES.AI_VIDEO_EDIT, before);
  assert.equal(GM.GENERATION_MODES.NEW_MODE, undefined);
});

section("generation_mode — modeOfJob");

t("template job kinds map to TEMPLATE_GENERATION", () => {
  const T = GM.GENERATION_MODES.TEMPLATE_GENERATION;
  assert.equal(GM.modeOfJob({ id: "abc123", kind: "generate" }), T);
  assert.equal(GM.modeOfJob({ id: "abc123", kind: "project" }), T);
  assert.equal(GM.modeOfJob({ jobId: "j_1", kind: "project", status: "done" }), T);
  assert.equal(GM.modeOfJob({ id: "legacy" }), T, "a row with no kind is a legacy template job");
});

t("null, undefined and non-objects never throw and are template generation", () => {
  const T = GM.GENERATION_MODES.TEMPLATE_GENERATION;
  for (const v of [null, undefined, 0, "", "ve_0123456789abcdef", [], true]) assert.equal(GM.modeOfJob(v), T);
});

t("edit records map to AI_VIDEO_EDIT", () => {
  const E = GM.GENERATION_MODES.AI_VIDEO_EDIT;
  assert.equal(GM.modeOfJob({ mode: "AI_VIDEO_EDIT" }), E);
  assert.equal(GM.modeOfJob({ id: "ve_0123456789abcdef" }), E);
});

t("look-alike ids and unknown modes stay template generation", () => {
  const T = GM.GENERATION_MODES.TEMPLATE_GENERATION;
  assert.equal(GM.modeOfJob({ id: "ve_SHORT" }), T);
  assert.equal(GM.modeOfJob({ id: "ve_0123456789ABCDEF" }), T);
  assert.equal(GM.modeOfJob({ mode: "ai_video_edit", kind: "generate" }), T);
});

run();
