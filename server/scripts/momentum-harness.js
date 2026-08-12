// DEV HARNESS — build a Momentum composition into a job dir for standalone
// render. Usage: node scripts/momentum-harness.js <outDir> [W] [H]
// Then render:  cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2
// Contact sheet: ffmpeg -i renders/out.mp4 -vf "fps=1,scale=460:-1,tile=6x5" c.jpg

const fs = require("node:fs");
const path = require("node:path");
const momentum = require("../src/services/momentum_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_momtest");
const W = Number(process.argv[3]) || 1280;
const H = Number(process.argv[4]) || 720;

fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

// Copy a real image next to the composition so the browser/phone/gallery slots
// render with an actual plate.
const thumbSrc = path.resolve(__dirname, "..", "public", "momentum-template", "thumb.png");
let shotPath = null;
if (fs.existsSync(thumbSrc)) {
  fs.copyFileSync(thumbSrc, path.join(outDir, "shot.png"));
  shotPath = "shot.png";
}

// A storyboard exercising every momentum scene-type.
const storyboard = {
  title: "NEBULA",
  durationSec: 34,
  scenes: [
    { id: "s1", start: 0,  duration: 4.5, kind: "hook",  purpose: "hook", headline: "The launch, engineered.", subtext: "THE LAUNCH, ENGINEERED" },
    { id: "s2", start: 4.5, duration: 3.5, kind: "text",  purpose: "manifesto", headline: "Build bold. Ship faster.", emphasis: "bold" },
    { id: "s3", start: 8,  duration: 5,   kind: "text",  purpose: "feature", headline: "Everything, in one canvas.", subtext: "Design, review and ship from a single fast surface. No context-switching, no lost momentum.", onScreenText: ["Real-time", "AI-native", "1-click deploy"] },
    { id: "s4", start: 13, duration: 4,   kind: "text",  purpose: "on the go", headline: "In your pocket.", onScreenText: ["Offline-first", "Push sync", "Face ID"] },
    { id: "s5", start: 17, duration: 4.5, kind: "stat",  purpose: "proof", headline: "Proof, not promises.", onScreenText: ["240% faster ships", "12k teams onboard", "99.9% uptime SLA"] },
    { id: "s6", start: 21.5, duration: 4, kind: "quote", purpose: "testimonial", quote: "This is the fastest we have ever shipped. Full stop.", author: "Alex Rivera", role: "HEAD OF PRODUCT · NORTHWIND" },
    { id: "s7", start: 25.5, duration: 4, kind: "text",  purpose: "showcase", headline: "Everything you need.", emphasis: "4.9★ 10k reviews" },
    { id: "s8", start: 29.5, duration: 4.5, kind: "cta", purpose: "cta", headline: "Start building.", emphasis: "START FREE" },
  ],
};

const assets = shotPath ? [
  { path: shotPath, source: "website", kind: "screenshot", width: 1200, height: 675, sceneId: "s3", sourceUrl: "https://nebula.app/product" },
  { path: shotPath, source: "website", kind: "screenshot", width: 675, height: 1200, ratio: 0.56, sceneId: "s4", sourceUrl: "https://nebula.app/mobile" },
  { path: shotPath, source: "website-image", kind: "photo", width: 1200, height: 800, sourceUrl: "https://nebula.app" },
  { path: shotPath, source: "website-image", kind: "photo", width: 1200, height: 800, sourceUrl: "https://nebula.app" },
] : [];

const captionCues = storyboard.scenes.map((s) => ({ start: s.start + 0.4, end: s.start + s.duration - 0.3, text: s.subtext || s.headline || s.quote }));

// --director runs the Template Director casting pass first (LLM off unless
// TEMPLATE_DIRECTOR=1), exactly as the pipeline does, so the harness exercises
// the same plan-driven path a real job takes.
(async () => {
  let templatePlan = null;
  if (process.argv.includes("--director")) {
    const { directTemplate } = require("../src/services/template_director");
    const { plan } = await directTemplate({
      jobId: "harness", storyboard, assets, framePack: "momentum",
      templateScenes: momentum.TEMPLATE_SCENES, subject: "Nebula product launch",
    });
    templatePlan = plan;
    for (const [sid, e] of Object.entries((plan && plan.byScene) || {})) {
      console.log(`  cast ${sid}: ${e.type} media=${(e.assets || []).length}`);
    }
  }
  const built = momentum.buildComposition({ storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "momentum", captionCues, assets, templatePlan });
  fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
  fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");
  console.log(`[momentum-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes)${templatePlan ? " — directed" : ""}`);
})().catch((e) => { console.error(e); process.exit(1); });
