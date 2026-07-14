// DEV HARNESS — build a Bright Life composition into a job dir for standalone render.
// Usage: node scripts/brightlife-harness.js <outDir> [ui|shot|none] [W] [H]
//   ui   → no real screenshots (exercises the generated light-UI cards)
//   shot → include the nebula stock assets (exercises real-asset cards)
// Then render:  cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2

const fs = require("node:fs");
const path = require("node:path");
const brightlife = require("../src/services/brightlife_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_bltest");
const mode = process.argv[3] || "ui";
const W = Number(process.argv[4]) || 1280;
const H = Number(process.argv[5]) || 720;

fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

// A realistic SaaS launch storyboard exercising all six Bright Life acts.
const storyboard = {
  title: "LUMINA",
  durationSec: 18,
  scenes: [
    { id: "s1", start: 0,  duration: 3, purpose: "hook",     kind: "hook",  headline: "Transform your workflow",       emphasis: "workflow",  subtext: "The bright platform for modern product teams." },
    { id: "s2", start: 3,  duration: 3, purpose: "problem",  kind: "text",  headline: "Your data is scattered everywhere", emphasis: "scattered" },
    { id: "s3", start: 6,  duration: 3, purpose: "solution", kind: "text",  headline: "One clean dashboard",           emphasis: "clean",     subtext: "Every metric, live, in one bright place." },
    { id: "s4", start: 9,  duration: 3, purpose: "features",  kind: "text",  headline: "Built for teams",               emphasis: "teams",     subtext: "Roles, reviews and realtime sync." },
    { id: "s5", start: 12, duration: 3, purpose: "benefits",  kind: "stat",  headline: "faster decisions",              emphasis: "10x",       subtext: "10x" },
    { id: "s6", start: 15, duration: 3, purpose: "cta",       kind: "cta",   headline: "Ready to build something amazing?", emphasis: "amazing", subtext: "lumina.app" },
  ],
};

let assets = [];
if (mode === "shot") {
  const src = path.resolve("jobs/nebulaflagship/assets/images");
  const names = fs.existsSync(src) ? fs.readdirSync(src).filter((f) => /\.(jpe?g|png)$/i.test(f)) : [];
  names.forEach((n, i) => {
    fs.copyFileSync(path.join(src, n), path.join(outDir, "assets", "images", n));
    assets.push({
      path: `assets/images/${n}`, type: "image",
      source: i === 0 ? "website" : "pixabay", visionOk: true,
      alt: i === 0 ? "product dashboard screenshot" : "supporting product visual",
      sceneId: null, width: 1200, height: 750, ratio: 1.6,
    });
  });
}

const { indexHtml, metaJson } = brightlife.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "brightlife", assets,
});
fs.writeFileSync(path.join(outDir, "index.html"), indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), metaJson, "utf8");
console.log(`[harness] wrote ${outDir} (mode=${mode}, ${W}x${H}, ${assets.length} assets)`);
