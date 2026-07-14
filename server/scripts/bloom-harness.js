// DEV HARNESS — build a Bloom Fable composition into a job dir for standalone render.
// Usage: node scripts/bloom-harness.js <outDir> [W] [H] [shot]
//   pass "shot" as arg 4 to also drop a synthetic screenshot asset (tests the plate)
// Then: cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2

const fs = require("node:fs");
const path = require("node:path");
const bloom = require("../src/services/bloom_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_bltest2");
const W = Number(process.argv[3]) || 1280;
const H = Number(process.argv[4]) || 720;
const withShot = process.argv[5] === "shot";

fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

const storyboard = {
  title: "SPROUT",
  durationSec: 24,
  scenes: [
    { id: "s1", start: 0,  duration: 4, purpose: "hook",    kind: "hook", headline: "Every idea is a seed", emphasis: "seed", subtext: "Whisper it one sentence — and watch it take root." },
    { id: "s2", start: 4,  duration: 4, purpose: "feature", kind: "text", headline: "You write one line", emphasis: "line", subtext: "Sprout grows the rest — from your sentence.", voiceover: "Just a sentence. Sprout writes the script. It designs every scene. And it scores the music too." },
    { id: "s3", start: 8,  duration: 4, purpose: "how",     kind: "text", headline: "It grows by itself", onScreenText: ["Write — one honest sentence", "Grow — agents design and score it", "Bloom — a finished film"] },
    { id: "s4", start: 12, duration: 4, purpose: "data",    kind: "stat", headline: "Tended with care", onScreenText: ["12 agents on every film", "1080p full-bloom", "100% hands-free"] },
    { id: "s5", start: 16, duration: 4, purpose: "problem", kind: "quote", headline: "Just a sentence", emphasis: "sentence", onScreenText: ["No studio.", "No stress."] },
    { id: "s6", start: 20, duration: 4, purpose: "cta",     kind: "cta",  headline: "SPROUT", emphasis: "Plant your first film", subtext: "Type a sentence. Watch it grow into a film." },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({ start: s.start + 0.5, end: s.start + s.duration - 0.3, text: s.subtext || s.headline }));

let assets = [];
if (withShot) {
  fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
  // caller must place a real image at assets/images/shot.png for the render
  assets = [{ path: "assets/images/shot.png", type: "image", source: "website", visionOk: true, cdScore: 95, sceneId: "s2", ratio: 1.6, alt: "product screenshot" }];
}

const built = bloom.buildComposition({ storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "bloom-fable", captionCues, assets });
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");
console.log(`[bloom-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes${withShot ? ", +shot plate" : ""})`);
