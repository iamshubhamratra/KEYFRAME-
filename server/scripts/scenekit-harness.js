// DEV HARNESS — build a default scene-kit composition into a job dir for standalone render.
// Usage: node scripts/scenekit-harness.js <outDir> <packId> [shot|none] [W] [H]
// Then render:  cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2

const fs = require("node:fs");
const path = require("node:path");
const scenekit = require("../src/services/scene_kit");

const outDir = path.resolve(process.argv[2] || "jobs/_sktest");
const pack = process.argv[3] || "nimbus-saas";
const mode = process.argv[4] || "shot";
const W = Number(process.argv[5]) || 720;
const H = Number(process.argv[6]) || 1280;

fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

// A realistic SaaS launch storyboard exercising hook / screenshot-hero / feature
// text / montage / stat / cta — the scene-kit work-horse archetypes.
const storyboard = {
  title: "NIMBUS",
  durationSec: 21,
  scenes: [
    { id: "s1", start: 0,  duration: 3, purpose: "hook",     kind: "hook",  headline: "Ship faster, every day",        emphasis: "faster",  subtext: "The launch platform for modern teams." },
    { id: "s2", start: 3,  duration: 4, purpose: "solution", kind: "title", headline: "One clean dashboard",            emphasis: "clean",   subtext: "Every metric, live, in one place." },
    { id: "s3", start: 7,  duration: 4, purpose: "features", kind: "caption", headline: "Built for teams",              emphasis: "teams",   subtext: "Roles, reviews and realtime sync." },
    { id: "s4", start: 11, duration: 3, purpose: "proof",    kind: "caption", headline: "Everything in one workspace",  emphasis: "one" },
    { id: "s5", start: 14, duration: 3, purpose: "benefits", kind: "stat",  headline: "faster decisions",               emphasis: "10x",     subtext: "10x" },
    { id: "s6", start: 17, duration: 4, purpose: "cta",      kind: "cta",   headline: "Start building today",           emphasis: "today",   subtext: "nimbus.app" },
  ],
};

let assets = [];
if (mode === "shot") {
  // Real website screenshots from a recent job dir (wide → browser-chrome hero).
  const src = fs.existsSync("jobs/_blport/assets/images") ? "jobs/_blport/assets/images"
    : (fs.existsSync("jobs/elnc5oal1s/assets/images") ? "jobs/elnc5oal1s/assets/images" : null);
  if (src) {
    const shots = fs.readdirSync(src).filter((f) => /^site_.*\.png$/i.test(f));
    shots.forEach((n, i) => {
      fs.copyFileSync(path.join(src, n), path.join(outDir, "assets", "images", n));
      assets.push({
        path: `assets/images/${n}`, type: "image",
        source: "website", visionOk: true,
        alt: `product dashboard screenshot ${i + 1}`,
        sceneId: null, width: 1440, height: 900, ratio: 1.6, cropFocus: "top center",
      });
    });
    // A couple of supporting vectors so the montage archetype has a pool.
    const vecs = fs.readdirSync(src).filter((f) => /\.svg$/i.test(f)).slice(0, 4);
    vecs.forEach((n) => {
      fs.copyFileSync(path.join(src, n), path.join(outDir, "assets", "images", n));
      assets.push({
        path: `assets/images/${n}`, type: "image",
        source: "pixabay", visionOk: true, style: "vector illustration",
        alt: "supporting product visual", sceneId: null, width: 800, height: 600, ratio: 1.33,
      });
    });
  }
}

const { indexHtml, metaJson } = scenekit.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: pack, assets, seedKey: "skport",
});
fs.writeFileSync(path.join(outDir, "index.html"), indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), metaJson, "utf8");
console.log(`[harness] wrote ${outDir} (pack=${pack}, mode=${mode}, ${W}x${H}, ${assets.length} assets)`);
