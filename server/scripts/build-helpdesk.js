// One-off build: a 30s Helpdesk AI launch film on the Bright Life template.
// Usage: node scripts/build-helpdesk.js <outDir> [W] [H]
const fs = require("node:fs");
const path = require("node:path");
const brightlife = require("../src/services/brightlife_composer");

const outDir = path.resolve(process.argv[2] || "jobs/helpdesk");
const W = Number(process.argv[3]) || 1920;
const H = Number(process.argv[4]) || 1080;
fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

// Six-act, 30s Helpdesk AI story — hook → problem → solution → features → benefits → cta.
// Product: an AI chatbot you add to your site in minutes; instant, accurate answers
// from your own business knowledge; integrated by pasting one script snippet.
const storyboard = {
  title: "HELPDESK AI",
  durationSec: 30,
  scenes: [
    { id: "s1", start: 0,  duration: 5, purpose: "hook",     kind: "hook",
      headline: "Instant answers, on autopilot", emphasis: "Instant",
      subtext: "The AI chatbot for your website." },
    { id: "s2", start: 5,  duration: 5, purpose: "problem",  kind: "text",
      headline: "Support doesn't scale", emphasis: "scale",
      subtext: "Customers wait. Your team drowns in repeat tickets.",
      onScreenText: ["Long waits", "Repeat questions", "Lost sales"] },
    { id: "s3", start: 10, duration: 5, purpose: "solution", kind: "text",
      headline: "Trained on your knowledge", emphasis: "your knowledge",
      subtext: "Accurate answers from your own business content." },
    { id: "s4", start: 15, duration: 5, purpose: "features", kind: "text",
      headline: "Live in minutes", emphasis: "minutes",
      subtext: "Knowledge base, instant replies, any website.",
      onScreenText: ["Knowledge base", "Instant replies", "Any site"] },
    { id: "s5", start: 20, duration: 5, purpose: "benefits", kind: "stat",
      headline: "of questions resolved", emphasis: "90%", subtext: "90%" },
    { id: "s6", start: 25, duration: 5, purpose: "cta",      kind: "cta",
      headline: "Paste one script. Go live.", emphasis: "one script",
      subtext: "helpdesk.ai" },
  ],
};

const { indexHtml, metaJson } = brightlife.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "brightlife", assets: [],
});
fs.writeFileSync(path.join(outDir, "index.html"), indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), metaJson, "utf8");
console.log(`[helpdesk] wrote ${outDir} (${W}x${H}, ${storyboard.durationSec}s, ${storyboard.scenes.length} scenes)`);
