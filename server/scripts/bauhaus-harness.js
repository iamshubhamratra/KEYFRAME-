// DEV HARNESS — build a Bauhaus Riot composition into a job dir. Usage:
// node scripts/bauhaus-harness.js <outDir> [W] [H] [#hex,#hex,...] [shot]
//   #hex list → an Art Director BRAND SKIN. bauhaus-riot FORMALLY OPTS OUT of brand
//     colour (the red/blue/yellow primaries ARE the movement, not a rentable slot), so
//     a skin here MUST be a no-op: the film renders byte-identically to the pack default
//     whether the skin is present or null. A diff between a skinned build and a null
//     build is therefore a bug — this arg exists to PROVE the opt-out, not to recolour.
//   shot → adds a plate asset
// Then: cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2

const fs = require("node:fs");
const path = require("node:path");
const bauhaus = require("../src/services/bauhaus_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_brtest");
const W = Number(process.argv[3]) || 1280;
const H = Number(process.argv[4]) || 720;
// Shaped like the Art Director's real output (art_director.js:132): accents lead,
// emphasis is an explicit 2-stop pair — so the harness exercises the exact skin shape
// the pack receives (and deliberately ignores) in production.
const brandHexes = String(process.argv[5] || "").split(",").map((s) => s.trim()).filter(Boolean);
const brandSkin = brandHexes.length
  ? { accents: brandHexes.slice(0, 3), emphasis: [brandHexes[0], brandHexes[1] || brandHexes[0]], source: "harness", provenance: "explicit" }
  : null;
const withShot = process.argv[6] === "shot";

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

const built = bauhaus.buildComposition({ storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "bauhaus-riot", captionCues, assets, brandSkin });
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");
console.log(`[bauhaus-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes${withShot ? ", +shot plate" : ""}, brand=${brandSkin ? brandSkin.accents.join("/") + " [opt-out: ignored]" : "none (pack primaries)"})`);
// resolvedBrand is null BY DESIGN — bauhaus-riot wears no brand. Report it so the
// opt-out is visible from the harness, not just asserted in the composer.
console.log(`[bauhaus-harness] resolvedBrand: ${built.resolvedBrand === null ? "null (formal opt-out — primaries are the movement)" : JSON.stringify(built.resolvedBrand)}`);
