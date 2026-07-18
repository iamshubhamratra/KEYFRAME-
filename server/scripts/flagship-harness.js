// DEV HARNESS — build a flagship composition into a job dir for standalone render.
// Usage: node scripts/flagship-harness.js <outDir> [ui|shot|none]
//   ui   → no real screenshots (exercises the generated-UI fallback)
//   shot → include the nebula stock assets (exercises real-asset plates)
// Then render:  cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality medium --workers 2

const fs = require("node:fs");
const path = require("node:path");
const flagship = require("../src/services/flagship_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_ftest");
const mode = process.argv[3] || "shot";
const W = Number(process.argv[4]) || 1280;
const H = Number(process.argv[5]) || 720;

fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

// A realistic SaaS launch storyboard exercising all six flagship acts.
const storyboard = {
  title: "NEBULA",
  durationSec: 18,
  scenes: [
    { id: "s1", start: 0,  duration: 3, purpose: "hook",     kind: "hook",  headline: "Ship faster",                 emphasis: "faster",    subtext: "The launch platform for modern product teams." },
    { id: "s2", start: 3,  duration: 3, purpose: "problem",  kind: "text",  headline: "Your data is scattered everywhere", emphasis: "scattered" },
    { id: "s3", start: 6,  duration: 3, purpose: "solution", kind: "text",  headline: "One clean dashboard",         emphasis: "clean",     subtext: "Every metric, live, in one place." },
    { id: "s4", start: 9,  duration: 3, purpose: "features",  kind: "text",  headline: "Built for teams",             emphasis: "teams",     subtext: "Roles, reviews and realtime sync." },
    { id: "s5", start: 12, duration: 3, purpose: "benefits",  kind: "stat",  headline: "faster decisions",            emphasis: "10x",       subtext: "10x" },
    { id: "s6", start: 15, duration: 3, purpose: "cta",       kind: "cta",   headline: "Start today",                 emphasis: "today",     subtext: "nebula.app" },
  ],
};

let assets = [];
if (mode === "shot") {
  const src = path.resolve("jobs/nebulaflagship/assets/images");
  const names = fs.existsSync(src) ? fs.readdirSync(src).filter((f) => /\.(jpe?g|png)$/i.test(f)) : [];
  names.forEach((n, i) => {
    fs.copyFileSync(path.join(src, n), path.join(outDir, "assets", "images", n));
    // Mark the first as a website screenshot (hero), the rest vision-approved.
    assets.push({
      path: `assets/images/${n}`, type: "image",
      source: i === 0 ? "website" : "pixabay", visionOk: true,
      alt: i === 0 ? "product dashboard screenshot" : "supporting product visual",
      sceneId: null, width: 1200, height: 750, ratio: 1.6,
    });
  });
}

const { indexHtml, metaJson } = flagship.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "flagship", assets,
});
fs.writeFileSync(path.join(outDir, "index.html"), indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), metaJson, "utf8");
console.log(`[harness] wrote ${outDir} (mode=${mode}, ${W}x${H}, ${assets.length} assets)`);
