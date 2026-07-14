// DEV HARNESS — build a Bauhaus Riot composition into a job dir. Usage:
// node scripts/bauhaus-harness.js <outDir> [W] [H] [shot]  ("shot" adds a plate asset)
// Then: cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2

const fs = require("node:fs");
const path = require("node:path");
const bauhaus = require("../src/services/bauhaus_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_brtest");
const W = Number(process.argv[3]) || 1280;
const H = Number(process.argv[4]) || 720;
const withShot = process.argv[5] === "shot";

fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

const storyboard = {
  title: "RIOT",
  durationSec: 24,
  scenes: [
    { id: "s1", start: 0,  duration: 4, purpose: "hook",    kind: "hook", headline: "Make motion", emphasis: "motion", subtext: "Type a sentence — get a poster-grade film." },
    { id: "s2", start: 4,  duration: 4, purpose: "how",     kind: "text", headline: "Write. Direct. Render.", onScreenText: ["Write", "Direct", "Render"] },
    { id: "s3", start: 8,  duration: 4, purpose: "data",    kind: "stat", headline: "Forty styles", onScreenText: ["40 styles", "12 agents", "1080p"], subtext: "Every one art-directed. Every one yours." },
    { id: "s4", start: 12, duration: 4, purpose: "problem", kind: "quote", headline: "Just words", emphasis: "Just words.", onScreenText: ["No crew.", "No timeline.", "No render farm."] },
    { id: "s5", start: 16, duration: 4, purpose: "feature", kind: "text", headline: "Twelve agents proof every frame", emphasis: "proof", subtext: "Layout, contrast, rhythm — checked before the ink dries.", voiceover: "Layout is measured. Contrast is checked. And the rhythm is proofed, every single frame." },
    { id: "s6", start: 20, duration: 4, purpose: "cta",     kind: "cta",  headline: "KEYFRAME", emphasis: "Start free", subtext: "print your first film" },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({ start: s.start + 0.5, end: s.start + s.duration - 0.3, text: s.subtext || s.headline }));

let assets = [];
if (withShot) {
  fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
  assets = [{ path: "assets/images/shot.png", type: "image", source: "website", visionOk: true, cdScore: 95, sceneId: "s5", ratio: 1.6, alt: "product screenshot" }];
}

const built = bauhaus.buildComposition({ storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "bauhaus-riot", captionCues, assets });
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");
console.log(`[bauhaus-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes${withShot ? ", +shot plate" : ""})`);
