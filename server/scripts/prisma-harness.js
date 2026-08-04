// DEV HARNESS — build a Prisma Bloc composition into a job dir. Usage:
//   node scripts/prisma-harness.js <outDir> [W] [H] [#hex,#hex,...] [shots]
//     #hex list → an Art Director BRAND SKIN (shaped exactly like art_director.js:132
//       emits: accents lead, emphasis an explicit 2-stop pair). Unlike bauhaus-riot,
//       prisma-bloc WEARS the skin: the whole palette — grounds, blocks, chips, outlines,
//       seam and ink — rotates onto the brand's lead hue, each colour pinned to its
//       authored luminance. A skinned build MUST differ from a null build, and
//       resolvedBrand MUST be non-null. That is what this arg proves.
//     shots → stages placeholder captures at three real aspect ratios so the
//       aspect-routing (browser / phone / card), the in-frame scroll and the gallery row
//       are all exercised.
// Then: cd <outDir> && npx --yes hyperframes@<pinned> render --output renders/out.mp4 --quality draft

const fs = require("node:fs");
const path = require("node:path");
const prisma = require("../src/services/prisma_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_prismatest");
const W = Number(process.argv[3]) || 1080;
const H = Number(process.argv[4]) || 1920;
const brandHexes = String(process.argv[5] || "").split(",").map((s) => s.trim()).filter(Boolean);
const brandSkin = brandHexes.length
  ? { accents: brandHexes.slice(0, 3), emphasis: [brandHexes[0], brandHexes[1] || brandHexes[0]], source: "harness", provenance: "explicit" }
  : null;
const withShots = process.argv[6] === "shots";

fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

// A storyboard shaped like the real one the graph emits: uneven VO-derived durations,
// mixed kinds/purposes, on-screen text, emphasis words and numbers.
const storyboard = {
  title: "Northwind Analytics",
  durationSec: 34.6,
  scenes: [
    { id: "s1", start: 0,    duration: 5.6, purpose: "hook",    kind: "hook",
      headline: "Your data finally makes sense", emphasis: "sense",
      onScreenText: ["Live dashboards", "No setup", "Any source"],
      voiceover: "Your data, finally making sense." },
    { id: "s2", start: 5.6,  duration: 4.4, purpose: "problem", kind: "text",
      headline: "Reporting eats the week",
      onScreenText: ["Spreadsheet sprawl — five tabs, one truth", "Stale numbers — yesterday's answer", "Manual rollups — every Monday"],
      subtext: "Three days of copy-paste before anyone can decide anything.",
      voiceover: "Reporting eats a whole week of your team." },
    { id: "s3", start: 10,   duration: 6.4, purpose: "feature", kind: "text",
      headline: "Connect once. Watch it build.",
      onScreenText: ["Warehouse ready", "Reads your schema"],
      voiceover: "Connect a source once, and watch the whole workspace build itself." },
    { id: "s4", start: 16.4, duration: 5.6, purpose: "how",     kind: "text",
      headline: "You keep the pen",
      onScreenText: ["Rewrite a metric", "Swap a chart", "Publish"],
      voiceover: "You still keep the pen on every metric." },
    { id: "s5", start: 22,   duration: 4.2, purpose: "data",    kind: "stat",
      headline: "Numbers that hold up",
      onScreenText: ["92% faster close", "40 sources", "3 minute setup"],
      voiceover: "Ninety-two percent faster, across forty sources." },
    { id: "s6", start: 26.2, duration: 4.4, purpose: "proof",   kind: "quote",
      headline: "We shipped the board deck in an afternoon",
      onScreenText: ["Priya N., Head of Finance"],
      voiceover: "We shipped the whole board deck in one afternoon." },
    { id: "s7", start: 30.6, duration: 4,   purpose: "cta",     kind: "cta",
      headline: "Northwind", emphasis: "Start free", subtext: "Your first dashboard in three minutes.",
      voiceover: "Start free — your first dashboard is three minutes away." },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({
  start: s.start + 0.35, end: s.start + s.duration - 0.35, text: s.voiceover || s.headline,
}));

// Real placeholder captures at three real aspect ratios (a tall desktop full-page grab, a
// phone screen, and photo crops) plus a logo, so every presentation path is exercised
// with imagery that ACTUALLY RENDERS. These used to be 1x1 transparent pixels with the
// geometry carried by the declared width/height — enough to prove which device a ratio
// routes to, but every mockup came out as empty tint and the logo plate as a blank box,
// so no frame could show whether a capture was cropped, letterboxed or panned correctly.
// scripts/lib/placeholder_assets.js draws numbered bands and corner markers precisely so
// those questions are answerable by eye. Declared dimensions match the real pixels.
const { stageAssets } = require("./lib/placeholder_assets");
const assets = withShots ? stageAssets(outDir, { sceneIds: ["s3", "s4", "s2"] }) : [];

const built = prisma.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "prisma-bloc",
  captionCues, assets, brandSkin, seedKey: "harness01",
});
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");

console.log(`[prisma-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes${withShots ? ", +5 assets" : ", no assets"}, brand=${brandSkin ? brandSkin.accents.join("/") : "none"})`);
console.log(`[prisma-harness] resolvedBrand: ${built.resolvedBrand ? built.resolvedBrand.accents.join(" ") : "null (unbranded — pack palette)"}`);
console.log(`[prisma-harness] html ${built.indexHtml.length} bytes · ${(built.indexHtml.match(/<img /g) || []).length} <img> · ${(built.indexHtml.match(/class="clip/g) || []).length} clips`);
