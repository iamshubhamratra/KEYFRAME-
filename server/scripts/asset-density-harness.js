// ASSET DENSITY HARNESS — how many scenes of a long film actually get a picture?
//
// WHY THIS EXISTS. "Long-form films look empty" was diagnosed three times by
// rendering a whole video (~30 min, real TTS + render cost) and then reading the
// delivery report's "N of M scenes have NO renderable visual" line. That is a
// terrible feedback loop for a supply problem, because everything that decides
// supply — the planner's caps, the fetch, the dedup, the Creative Director's
// reject/demote pass — finishes in the first few minutes and never needs a frame
// to be drawn.
//
// This harness runs EXACTLY that prefix: graph.js's asset_search node (which
// inlines the planner) against a synthetic script of N scenes, then reports where
// each planned slot went. No storyboard, no composition, no render.
//
//   node scripts/asset-density-harness.js [--scenes 40] [--subject "..."] [--pack field-notes]
//
// Reads CREATIVE_DIRECTOR=0 like production, so the CD's contribution to the loss
// can be measured by running it twice.

const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const N_SCENES = Number(argOf("scenes", 40));
const SUBJECT = argOf("subject", "artificial intelligence");
const PACK = argOf("pack", "field-notes");

// A synthetic long-form script. The shape is what matters, not the prose: the
// planner derives queries from `visualDirection` + `voiceover` when a scene
// declares no assetNeeds, which is the realistic long-form case (the script
// writer tags a handful of scenes and leaves the rest bare).
const BEATS = [
  ["the opening claim", "a wide establishing shot over a data centre at dawn"],
  ["how the method works", "a diagram assembling itself from moving parts"],
  ["the historical origin", "archival photographs fading between eras"],
  ["a concrete example", "a close macro shot of circuitry and light"],
  ["the counter-argument", "two opposing forces meeting in the frame"],
  ["measured results", "a chart drawing itself across the screen"],
  ["what practitioners say", "a person at work in a laboratory setting"],
  ["the cost side", "an industrial landscape under heavy weather"],
  ["where it is heading", "a horizon opening up in slow forward motion"],
  ["the closing thought", "the frame settling on a single quiet object"],
];

function makeScript(n) {
  const scenes = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const [purpose, direction] = BEATS[i % BEATS.length];
    const dur = 6;
    scenes.push({
      id: `s${i + 1}`,
      start: t,
      duration: dur,
      purpose: i === 0 ? "hook" : i === n - 1 ? "cta" : purpose.slice(0, 24),
      voiceover: `This is the narration for beat ${i + 1}, covering ${purpose} in the story of ${SUBJECT}.`,
      onScreenText: [`Beat ${i + 1}`],
      visualDirection: direction,
      assetNeeds: [],
      sfx: [],
      musicCue: "steady",
    });
    t += dur;
  }
  return { title: `A film about ${SUBJECT}`, scenes, music: { mood: "calm", query: "ambient" }, voice: { style: "warm", pace: "medium" } };
}

(async () => {
  const jobId = `_harness_assets`;
  const config = require("../src/config");
  const jobDir = path.join(config.paths.jobsDir, jobId);
  fs.rmSync(jobDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "assets", "videos"), { recursive: true });

  const { UsageTracker } = require("../src/services/usage");
  const tracker = new UsageTracker();
  const script = makeScript(N_SCENES);

  const s = {
    job: {
      id: jobId, orientation: "horizontal", width: 1280, height: 720, fps: 30,
      duration: N_SCENES * 6,
      // No website / blog / uploads: this isolates the STOCK supply path, which
      // is the one that has to carry a film with no owner content behind it.
      intent: {}, website_screenshots: [], user_assets: [], blog_images: [],
    },
    jobDir, tracker, script,
    brief: { subject: SUBJECT, keyMessages: [`${SUBJECT} matters`], audience: "general", goal: "explain" },
    framePack: PACK,
  };

  const t0 = Date.now();
  const { __test_assetSearchAgent } = require("../src/agents/graph");
  const out = await __test_assetSearchAgent(s);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const assets = out.assets || [];
  const withScene = assets.filter((a) => a.sceneId != null && a.sceneId !== undefined);
  const covered = new Set(withScene.map((a) => String(a.sceneId)));
  const bySource = {};
  for (const a of assets) bySource[a.source || "?"] = (bySource[a.source || "?"] || 0) + 1;
  const prominent = assets.filter((a) => a.visionOk === true).length;

  console.log("\n================ ASSET DENSITY ================");
  console.log(`scenes:            ${N_SCENES}   subject: "${SUBJECT}"   pack: ${PACK}`);
  console.log(`elapsed:           ${elapsed}s`);
  console.log(`CREATIVE_DIRECTOR: ${process.env.CREATIVE_DIRECTOR ?? "(default on)"}`);
  console.log(`final assets:      ${assets.length}`);
  console.log(`  pinned to scene: ${withScene.length}`);
  console.log(`  unpinned:        ${assets.length - withScene.length}`);
  console.log(`  vision-approved: ${prominent}  (eligible for PROMINENT slots)`);
  console.log(`scenes covered:    ${covered.size}/${N_SCENES}  (${Math.round(covered.size / N_SCENES * 100)}%)`);
  console.log(`scenes EMPTY:      ${N_SCENES - covered.size}`);
  console.log(`by source:`, bySource);
  const empties = script.scenes.map((x) => x.id).filter((id) => !covered.has(id));
  if (empties.length) console.log(`empty scene ids:   ${empties.join(", ")}`);
  console.log("==============================================\n");

  // Exit non-zero when a long film would still render mostly bare, so this can
  // gate a change the way the other scripts/*.test.cjs guards do.
  const coverage = covered.size / N_SCENES;
  if (coverage < 0.6) {
    console.error(`FAIL: only ${Math.round(coverage * 100)}% of scenes carry a visual (want >=60%)`);
    process.exit(1);
  }
  console.log(`OK: ${Math.round(coverage * 100)}% scene coverage`);
})().catch((e) => { console.error("harness threw:", e); process.exit(1); });
