// DEV HARNESS — build a Paper Tales composition into a job dir. Usage:
// node scripts/paper-tales-harness.js <outDir> [W] [H] [shot]   ("shot" adds a cinema screenshot)
// Then: cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2

const fs = require("node:fs");
const path = require("node:path");
const paper = require("../src/services/paper_tales_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_pttest");
const W = Number(process.argv[3]) || 1280;
const H = Number(process.argv[4]) || 720;
const withShot = process.argv[5] === "shot";

fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

const storyboard = {
  title: "The Little Idea",
  durationSec: 36,
  scenes: [
    { id: "s1", start: 0,  duration: 5.4, purpose: "hook",    kind: "hook",  headline: "The Little Idea", emphasis: "Idea", kicker: "a keyframe bedtime story" },
    { id: "s2", start: 5,  duration: 5.4, purpose: "context", kind: "text",  headline: "Once upon a time, there was a little idea", emphasis: "idea", subtext: "It was small, but it wanted to be a film…" },
    { id: "s3", start: 10, duration: 5.4, purpose: "feature", kind: "text",  headline: "So it whispered one sentence", emphasis: "sentence", subtext: "Please make me into something lovely." },
    { id: "s4", start: 15, duration: 5.4, purpose: "team",    kind: "text",  headline: "Twelve paper friends set to work", emphasis: "friends", onScreenText: ["one wrote", "one painted", "one hummed", "one drew", "one dreamed"], subtext: "One wrote, one painted, one hummed a tune…" },
    { id: "s5", start: 20, duration: 5.4, purpose: "create",  kind: "text",  headline: "They painted whole worlds for it", emphasis: "worlds", subtext: "hills, a sun, and a song that floated up" },
    { id: "s6", start: 25, duration: 5.9, purpose: "solution",kind: "text",  headline: "And the little idea became a film", emphasis: "film", subtext: "A real one — with music, colour, and an ending." },
    { id: "s7", start: 30.5, duration: 5.5, purpose: "cta",   kind: "cta",   headline: "KEYFRAME", emphasis: "Write yours — free", subtext: "every idea deserves a story" },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({ start: s.start + 0.7, end: s.start + s.duration - 0.5, text: s.subtext || s.headline }));

let assets = [];
if (withShot) {
  fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
  assets = [{ path: "assets/images/shot.png", type: "image", source: "website", visionOk: true, cdScore: 95, sceneId: "s6", ratio: 1.5, alt: "product screenshot" }];
}

const built = paper.buildComposition({ storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "paper-tales", captionCues, assets });
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");
console.log(`[paper-tales-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes${withShot ? ", +cinema screenshot" : ""})`);
