// DEV HARNESS — build a Blueprint Atelier composition into a job dir for standalone
// render. Usage: node scripts/blueprint-harness.js <outDir> [W] [H] [#hex,#hex,...]
//   #hex list → an Art Director BRAND SKIN, to eyeball what the brand may steer (here: the
//     amber accent ONLY). Omit it and the film must render byte-identically to the pack
//     default — a null skin is a no-op by contract (brand_kit.js:25), so a diff here is a bug.
// Then render:  cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2
// Contact sheet: ffmpeg -i renders/out.mp4 -vf "fps=1,scale=460:-1,tile=6x4" c.jpg

const fs = require("node:fs");
const path = require("node:path");
const blueprint = require("../src/services/blueprint_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_bptest");
const W = Number(process.argv[3]) || 1280;
const H = Number(process.argv[4]) || 720;
// Shaped like the Art Director's real output (art_director.js:132): accents lead, emphasis
// is an explicit 2-stop pair.
const brandHexes = String(process.argv[5] || "").split(",").map((s) => s.trim()).filter(Boolean);
const brandSkin = brandHexes.length
  ? { accents: brandHexes.slice(0, 3), emphasis: [brandHexes[0], brandHexes[1] || brandHexes[0]], source: "harness", provenance: "explicit" }
  : null;

fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

// A storyboard exercising every blueprint scene-type.
const storyboard = {
  title: "NEBULA",
  durationSec: 24,
  scenes: [
    { id: "s1", start: 0,  duration: 4, purpose: "hook",     kind: "hook",  headline: "Draw up a film.", emphasis: "SPEC 001", subtext: "Everything below this line is drafted, checked and rendered by machines." },
    { id: "s2", start: 4,  duration: 4, purpose: "feature",  kind: "text",  headline: "Drawn by twelve agents", emphasis: "twelve", subtext: "Storyboard, styling, camera and score — drafted to spec, not improvised." },
    { id: "s3", start: 8,  duration: 4, purpose: "how",      kind: "text",  headline: "Fully automatic pipeline", onScreenText: ["Script — your sentence becomes scenes", "Direct — agents stage every frame", "Render — deterministic, no retakes"] },
    { id: "s4", start: 12, duration: 4, purpose: "data",     kind: "stat",  headline: "measured output", emphasis: "97", subtext: "Full HD, thirty frames a second, zero drift." },
    { id: "s5", start: 16, duration: 4, purpose: "problem",  kind: "quote", headline: "the old way", emphasis: "Just words.", onScreenText: ["Hire a crew", "Book a studio", "Edit for weeks"] },
    { id: "s6", start: 20, duration: 4, purpose: "cta",      kind: "cta",   headline: "NEBULA", emphasis: "Open a new sheet", subtext: "Draft a film from a single sentence." },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({ start: s.start + 0.4, end: s.start + s.duration - 0.3, text: s.subtext || s.headline }));

const built = blueprint.buildComposition({ storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "blueprint-atelier", captionCues, assets: [], brandSkin });
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");
console.log(`[blueprint-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes, brand=${brandSkin ? brandSkin.accents.join("/") : "none (pack amber)"})`);
if (built.resolvedBrand) console.log(`[blueprint-harness] resolvedBrand: ${built.resolvedBrand.accents.join("/")} (tier ${built.resolvedBrand.tier})`);
