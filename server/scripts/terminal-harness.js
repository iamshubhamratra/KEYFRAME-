// DEV HARNESS — build a Terminal Departures composition into a job dir. Usage:
// node scripts/terminal-harness.js <outDir> [W] [H] [#hex,#hex,...] [shot]
//   #hex list → an Art Director BRAND SKIN, to eyeball what the brand may steer (the signage
//     GOLD only). Omit it and the film must render byte-identically to the pack default — a
//     null skin is a no-op by contract (brand_kit.js:25), so a diff here is a bug.
//   shot → adds a gate-monitor asset
// Then: cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2

const fs = require("node:fs");
const path = require("node:path");
const terminal = require("../src/services/terminal_departures_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_tdtest");
const W = Number(process.argv[3]) || 1280;
const H = Number(process.argv[4]) || 720;
// Shaped like the Art Director's real output (art_director.js:132): accents lead, emphasis
// is an explicit 2-stop pair.
const brandHexes = String(process.argv[5] || "").split(",").map((s) => s.trim()).filter(Boolean);
const brandSkin = brandHexes.length
  ? { accents: brandHexes.slice(0, 3), emphasis: [brandHexes[0], brandHexes[1] || brandHexes[0]], source: "harness", provenance: "explicit" }
  : null;
const withShot = process.argv[6] === "shot";

fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

const storyboard = {
  title: "KEYFRAME AIR",
  durationSec: 30,
  scenes: [
    { id: "s1", start: 0,  duration: 5, purpose: "hook",    kind: "hook",  headline: "Ideas depart", emphasis: "daily", subtext: "welcome to KEYFRAME — the film terminal" },
    { id: "s2", start: 5,  duration: 5, purpose: "how",     kind: "text",  headline: "Every style is a destination", onScreenText: ["Bauhaus print", "Longshot cinema", "Vapor chrome", "Bloom fable"], subtext: "all departures on time" },
    { id: "s3", start: 10, duration: 5, purpose: "feature", kind: "text",  headline: "See it live", subtext: "your product, boarding now", voiceover: "Your real screen, mounted at the gate for everyone to see." },
    { id: "s4", start: 15, duration: 5, purpose: "data",    kind: "stat",  headline: "By the numbers", onScreenText: ["12 agents on crew", "1080p cruising", "40 destinations"] },
    { id: "s5", start: 20, duration: 5, purpose: "problem", kind: "quote", headline: "No baggage required", onScreenText: ["No crew", "No timeline", "No render farm"], subtext: "just your words — we pack the rest" },
    { id: "s6", start: 25, duration: 5, purpose: "cta",     kind: "cta",   headline: "KEYFRAME", emphasis: "Board now — free", subtext: "your film boards in one sentence" },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({ start: s.start + 0.6, end: s.start + s.duration - 0.4, text: s.subtext || s.headline }));

let assets = [];
if (withShot) {
  fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
  assets = [{ path: "assets/images/shot.png", type: "image", source: "website", visionOk: true, cdScore: 95, sceneId: "s3", ratio: 1.6, alt: "product screenshot" }];
}

const built = terminal.buildComposition({ storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "terminal-departures", captionCues, assets, brandSkin });
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");
console.log(`[terminal-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes${withShot ? ", +gate monitor" : ""}, brand=${brandSkin ? brandSkin.accents.join("/") : "none (pack gold)"})`);
if (built.resolvedBrand) console.log(`[terminal-harness] resolvedBrand: ${built.resolvedBrand.accents.join("/")} (tier ${built.resolvedBrand.tier})`);
