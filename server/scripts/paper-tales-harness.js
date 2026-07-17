// DEV HARNESS — build a Paper Tales composition into a job dir. Usage:
// node scripts/paper-tales-harness.js <outDir> [W] [H] [#hex,#hex,...] [shot]
//   #hex list → an Art Director BRAND SKIN, to eyeball what the brand may steer. Omit it
//     and the film must render byte-identically to the pack default — a null skin is a
//     no-op by contract (brand_kit.js:25), so a diff here is a bug.
//   shot → adds a cinema screenshot
// Then: cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2

const fs = require("node:fs");
const path = require("node:path");
const paper = require("../src/services/paper_tales_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_pttest");
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
  title: "The Little Idea",
  durationSec: 36,
  scenes: [
    { id: "s1", start: 0,  duration: 5.4, purpose: "hook",    kind: "hook",  headline: "The Little Idea", emphasis: "Idea", kicker: "a keyframe bedtime story" },
    { id: "s2", start: 5,  duration: 5.4, purpose: "context", kind: "text",  headline: "Once upon a time, there was a little idea", emphasis: "idea", subtext: "It was small, but it wanted to be a film…", onScreenText: ["Barely a whisper", "Nowhere to begin", "But full of hope"] },
    { id: "s3", start: 10, duration: 5.4, purpose: "feature", kind: "text",  headline: "So it whispered one sentence", emphasis: "sentence", subtext: "Please make me into something lovely.", onScreenText: ["No brief", "No crew", "Just one line"] },
    { id: "s4", start: 15, duration: 5.4, purpose: "team",    kind: "text",  headline: "Twelve paper friends set to work", emphasis: "friends", onScreenText: ["One wrote the script", "One painted the scenes", "One hummed a tune"], subtext: "Each one had a job to do…" },
    { id: "s5", start: 20, duration: 5.4, purpose: "create",  kind: "text",  headline: "They painted whole worlds for it", emphasis: "worlds", subtext: "hills, a sun, and a song that floated up", onScreenText: ["Rolling green hills", "A warm paper sun", "A little melody"] },
    { id: "s6", start: 25, duration: 5.9, purpose: "solution",kind: "text",  headline: "And the little idea became a film", emphasis: "film", subtext: "A real one — with music, colour, and an ending.", onScreenText: ["Music and colour", "A beginning", "And a happy ending"] },
    { id: "s7", start: 30.5, duration: 5.5, purpose: "cta",   kind: "cta",   headline: "KEYFRAME", emphasis: "Write yours — free", subtext: "every idea deserves a story" },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({ start: s.start + 0.7, end: s.start + s.duration - 0.5, text: s.subtext || s.headline }));

let assets = [];
if (withShot) {
  fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
  assets = [{ path: "assets/images/shot.png", type: "image", source: "website", visionOk: true, cdScore: 95, sceneId: "s6", ratio: 1.5, alt: "product screenshot" }];
}

const built = paper.buildComposition({ storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "paper-tales", captionCues, assets, brandSkin });
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");
console.log(`[paper-tales-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes${withShot ? ", +cinema screenshot" : ""}, brand=${brandSkin ? brandSkin.accents.join("/") : "none (pack pastels)"})`);
if (built.resolvedBrand) console.log(`[paper-tales-harness] resolvedBrand: ${built.resolvedBrand.accents.join("/")} (tier ${built.resolvedBrand.tier})`);
