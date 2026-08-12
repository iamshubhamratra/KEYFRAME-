// GRAPH TOPOLOGY GUARD.
//
// LangGraph validates the node/edge graph at COMPILE time — an edge naming a node
// that does not exist, a node nothing routes to, a join on a missing branch. None
// of that is caught by requiring the module; it only surfaces when buildGraph()
// runs, which previously happened for the first time inside a paid production
// run. A typo in an edge name therefore cost a real job to discover.
//
// This compiles the graph and asserts the pipeline's shape, so a bad edge is a
// failed `npm test` instead of a failed film.

const assert = require("node:assert");

const EXPECTED_NODES = [
  "frame_selector", "art_director", "storyboard_agent", "scene_planner",
  "asset_search", "text_director", "caption_director", "localization_director",
  "visual_layout_director", "voice_agent", "composition", "animation",
  "timeline", "qa_agent", "dead_frame_repair", "contrast_repair", "repair",
];

(async () => {
  const { __test_buildGraph } = require("../src/agents/graph");
  const compiled = await __test_buildGraph();
  assert.ok(compiled, "buildGraph() returned nothing");

  const nodes = Object.keys(compiled.nodes || {});
  const missing = EXPECTED_NODES.filter((n) => !nodes.includes(n));
  assert.deepStrictEqual(missing, [], `graph is missing node(s): ${missing.join(", ")}`);

  console.log(`  PASS  graph compiles (${nodes.length} nodes)`);
  console.log(`  PASS  every expected pipeline node is present`);

  // The language path must be reachable but must cost nothing for an English
  // film — the overwhelmingly common case. Both directors short-circuit on a
  // source-language plan, so assert that contract directly.
  const languageDirector = require("../src/services/language_director");
  const captionDirector = require("../src/services/caption_director");
  const en = languageDirector.resolveLanguagePlan({ job: { captions_enabled: 0 }, brief: {} });
  assert.strictEqual(en.voiceLanguage, captionDirector.SOURCE_LANG, "English film must resolve to the source voice language");
  assert.strictEqual(en.videoTextLanguage, captionDirector.SOURCE_LANG, "English film must resolve to the source video-text language");
  assert.strictEqual(en.font, null, "English film must not request a script font");
  console.log("  PASS  an English film resolves to a no-op language plan");

  // ...and a localized one must actually carry a font, or the render is tofu.
  const hi = languageDirector.resolveLanguagePlan({
    job: { captions_config: { enabled: true, language: "hi", videoTextLanguage: "hi" } }, brief: {},
  });
  assert.ok(hi.font && hi.font.family, "a Hindi film must resolve a script font");
  const captionRender = require("../src/services/caption_render");
  const styles = captionRender.buildLanguageStyles("hi", "hi", { captionsEnabled: true });
  const injected = captionRender.injectCaptionStyle("<html><head></head><body></body></html>", styles);
  assert.ok(/@font-face/.test(injected), "the Hindi font face must be injected into the document");
  assert.ok(/base64/.test(injected), "the font must be EMBEDDED (base64), not linked — the renderer has no network");
  console.log("  PASS  a Hindi film embeds its script font as base64 (no tofu)");

  // English must remain byte-identical through the same seam.
  const enStyles = captionRender.buildLanguageStyles("en", "en", { captionsEnabled: true });
  const html = "<html><head></head><body>hi</body></html>";
  assert.strictEqual(captionRender.injectCaptionStyle(html, enStyles), html,
    "an English film's document must pass through the language seam unchanged");
  console.log("  PASS  an English document is unchanged by the language seam");

  console.log("\ngraph topology + language plumbing hold");
})().catch((e) => {
  console.error(`\nFAIL — ${e.message}`);
  process.exit(1);
});
