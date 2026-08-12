#!/usr/bin/env node
// MOTION QUALITY GATE — the motion spec's "Quality Rules", enforced.
//
// The rules are only worth writing down if a build can fail on them, so this
// asserts each one against the composition a family actually emits:
//
//   1. every scene carries at least one meaningful TEXT animation
//   2. every card has an entrance AND a continuous idle
//   3. camera movement is continuous — no completely static scene
//   4. crossfade is not the primary transition
//   5. the UI responds (cursor / scroll / press / counter), not a static shot
//   6. timing and easing are the shared vocabulary, not per-family invention
//
// Checks the emitted timeline source rather than a render: these are structural
// properties, and reading them from the source makes the gate fast and exact.
// Run: npm run check:motion  [family_bright ...]

const path = require("node:path");
const M = require("../src/services/motion_presets");

const FAMILIES = [
  ["family_bright", "mint-launch"],
  ["family_editorial", "atelier"],
  ["family_story", "paper-tales"],
  ["family_cinema", "longshot-cinema"],
  ["family_poster", "bold-poster"],
  ["family_terminal", "terminal-green"],
  ["family_darkpremium", "midnight-glass"],
  ["family_charged", "voltage"],
];

// A storyboard with enough variety that every scene type can be reached.
const storyboard = {
  title: "Acme", brand: "Acme", url: "acme.com", durationSec: 32,
  scenes: [
    { id: "s1", start: 0, duration: 4, kind: "hook", headline: "Ship faster every week", kicker: "Introducing" },
    { id: "s2", start: 4, duration: 4, kind: "feature", headline: "One place for the work", subtext: "Teams move without waiting.", bullets: ["Automatic sync", "Shared review", "One click ship"] },
    { id: "s3", start: 8, duration: 4, kind: "stat", headline: "Proven in production", stats: [{ value: "94%", label: "less waiting" }] },
    { id: "s4", start: 12, duration: 4, kind: "quote", headline: "What teams say", quote: "It changed how our team ships.", author: "Dana Reed" },
    { id: "s5", start: 16, duration: 4, kind: "bullet", headline: "Built for the work", bullets: ["Fast", "Shared", "Simple"] },
    { id: "s6", start: 20, duration: 4, kind: "feature", headline: "Everything connected", bullets: ["Docs", "Tasks", "Chat"] },
    { id: "s7", start: 24, duration: 4, kind: "proof", headline: "Trusted widely", bullets: ["Teams", "Studios"] },
    { id: "s8", start: 28, duration: 4, kind: "cta", headline: "Start today", cta: "Get started" },
  ],
};

// The vocabulary a scene's timeline must show evidence of.
const TEXT_MOTION = /kfWords\(|kfChars\(|webkitTextStroke|stagger:/;
const CAMERA_MOTION = /-cami"/;
const UI_MOTION = /kfcur|scaleY|countTxt\(|strokeDashoffset|scale:0\.96|boxShadow/;
// Families name their ambient layers differently (bd-wash, bd-fibre, bd-haze,
// bd-aura, bd-horizon…). Match the shared prefix, plus the orb/glow elements
// some families use instead — a hardcoded id list silently rots.
const AMBIENT = /id="bd-|class="bd-|-orb"|-glow"|crt-/;

function scenesOf(html) {
  // Each scene clip carries its own id; the timeline lines that name it are that
  // scene's motion. Chrome/caption tracks are excluded by the tpl-scene class.
  const ids = [...html.matchAll(/class="clip tpl-scene" id="(s\d+)"/g)].map((m) => m[1]);
  const script = (html.split("<script>").pop() || "");
  return ids.map((id) => ({
    id,
    lines: script.split("\n").filter((l) => l.includes(`#${id}`) || l.includes(`.${id}`)).join("\n"),
  }));
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
let checked = 0, failed = 0;

for (const [mod, pack] of FAMILIES) {
  if (only.length && !only.includes(mod) && !only.includes(pack)) continue;
  let built;
  try {
    built = require(path.join("..", "src", "services", `${mod}.js`))
      .buildComposition({ storyboard, dims: { width: 1920, height: 1080, fps: 30 }, framePack: pack, assets: [] });
  } catch (e) {
    console.log(`  ✗  ${mod} — build threw: ${e.message}`); failed++; continue;
  }
  const html = built.indexHtml;
  const problems = [];

  // Rule 4 — the clip's own opacity ramp is a crossfade. Under the motion system
  // the clip is switched on instantly and a preset carries the arrival.
  const fades = (html.match(/tl\.fromTo\("#s\d+",\{opacity:0\}/g) || []).length;
  const usesMotion = /kfWords\(|kfChars\(/.test(html);
  if (usesMotion && fades) problems.push(`${fades} scene(s) still arrive on a crossfade`);

  // Rule 6 — the shared timing table, not per-family invention.
  if (usesMotion && !html.includes(`ease:"${M.TIMING.textEase}"`)) {
    problems.push(`house text ease ${M.TIMING.textEase} absent — family is inventing its own timing`);
  }

  const scenes = scenesOf(html);
  if (!scenes.length) problems.push("no scene clips found");
  for (const s of scenes) {
    if (!TEXT_MOTION.test(s.lines)) problems.push(`${s.id}: no text animation`);          // rule 1
    if (!CAMERA_MOTION.test(s.lines)) problems.push(`${s.id}: no camera move`);           // rule 3
  }
  // Rule 2 — a card that enters must also idle. cardRise3D always emits the 3D
  // rise; floatingIdle always emits a yoyo repeat on the same selector.
  const rises = (html.match(/rotationX:12/g) || []).length;
  const idles = (html.match(/yoyo:true,repeat:reps\(/g) || []).length;
  if (rises && !idles) problems.push(`${rises} card entrance(s) with no idle`);
  // Rule 5 — the film shows a UI that answers.
  if (usesMotion && !UI_MOTION.test(html)) problems.push("no UI microinteraction anywhere");
  // Part 5 — ambient layer.
  if (usesMotion && !AMBIENT.test(html)) problems.push("no ambient layer");

  checked++;
  if (problems.length) {
    failed++;
    console.log(`  ✗  ${mod} (${pack}) — ${problems.length} issue(s)`);
    for (const p of problems.slice(0, 8)) console.log(`       ${p}`);
  } else {
    console.log(`  ✓  ${mod} (${pack})`);
  }
}

console.log(`\n${checked} family/families checked, ${failed} failing the motion quality rules.`);
// All eight families are converted, so this is now a real gate: a family that
// regresses on any quality rule fails the build rather than printing a warning
// nobody reads.
process.exit(failed ? 1 : 0);
