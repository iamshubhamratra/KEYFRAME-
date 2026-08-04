// DEV HARNESS — build any of the seven OM-stage packs into a job dir. Usage:
//   node scripts/om-harness.js <pack> <outDir> [W] [H] [#hex,#hex,...] [shots]
//     <pack>   organic-garden | lantern-night | daybreak-bakehouse | story-blocks |
//              poster-pop | premiere-night | hype-wave   (or "all" to build every one)
//     #hex     an Art Director BRAND SKIN, shaped exactly as art_director.js:132 emits
//              (accents lead, emphasis an explicit 2-stop pair). These packs WEAR it —
//              the whole world recolours — so a skinned build MUST differ from a null one
//              and resolvedBrand MUST be non-null. That is what this arg proves.
//     shots    stage placeholder captures at three real aspect ratios + a logo, so the
//              aspect routing (browser / phone / card), the in-frame scroll and the tile
//              wall are all exercised.
// Then: cd <outDir> && npx --yes hyperframes@<pinned> render --output renders/out.mp4 --quality draft

const fs = require("node:fs");
const path = require("node:path");

const PACKS = {
  "organic-garden": "../src/services/om_skins/organic_garden",
  "lantern-night": "../src/services/om_skins/lantern_night",
  "daybreak-bakehouse": "../src/services/om_skins/daybreak_bakehouse",
  "story-blocks": "../src/services/om_skins/story_blocks",
  "poster-pop": "../src/services/om_skins/poster_pop",
  "premiere-night": "../src/services/om_skins/premiere_night",
  "hype-wave": "../src/services/om_skins/hype_wave",
};

const packArg = process.argv[2] || "organic-garden";
const outRoot = path.resolve(process.argv[3] || "jobs/_om");
const W = Number(process.argv[4]) || 1080;
const H = Number(process.argv[5]) || 1920;
const brandHexes = String(process.argv[6] || "").split(",").map((s) => s.trim()).filter(Boolean);
const brandSkin = brandHexes.length
  ? { accents: brandHexes.slice(0, 3), emphasis: [brandHexes[0], brandHexes[1] || brandHexes[0]], source: "harness", provenance: "explicit" }
  : null;
const withShots = process.argv[7] === "shots";

// A storyboard shaped like the real one the graph emits: uneven VO-derived durations,
// mixed kinds/purposes, on-screen text, emphasis words and numbers — one scene per beat.
const storyboard = {
  title: "Northwind",
  durationSec: 24.6,
  scenes: [
    { id: "s1", start: 0, duration: 4.4, purpose: "hook", kind: "hook",
      headline: "Your data finally makes sense", emphasis: "sense",
      subtext: "Built from your own site, screens and story.",
      voiceover: "Your data, finally making sense." },
    { id: "s2", start: 4.4, duration: 3.8, purpose: "problem", kind: "text",
      headline: "Reporting eats the whole week",
      subtext: "Three days of copy-paste before anyone can decide anything.",
      voiceover: "Reporting eats a whole week of your team." },
    { id: "s3", start: 8.2, duration: 4.6, purpose: "feature", kind: "text",
      headline: "Connect once. Watch it build.",
      onScreenText: ["Warehouse ready", "Reads your schema", "No setup"],
      voiceover: "Connect a source once and watch the workspace build itself." },
    { id: "s4", start: 12.8, duration: 4, purpose: "montage", kind: "text",
      headline: "Every corner of the product",
      onScreenText: ["Home", "Dashboard", "Details", "Mobile"],
      voiceover: "Every corner of the product, in one pass." },
    { id: "s5", start: 16.8, duration: 4, purpose: "data", kind: "stat",
      headline: "Numbers that hold up",
      onScreenText: ["92% faster close", "40 sources", "3 minute setup"],
      voiceover: "Ninety-two percent faster, across forty sources." },
    { id: "s6", start: 20.8, duration: 3.8, purpose: "cta", kind: "cta",
      headline: "Northwind", emphasis: "Start free", subtext: "Your first dashboard in three minutes.",
      voiceover: "Start free — your first dashboard is three minutes away." },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({
  start: s.start + 0.35, end: s.start + s.duration - 0.35, text: s.voiceover || s.headline,
}));

// Placeholder captures at three real aspect ratios plus a logo. The bytes are a 1×1
// transparent pixel — layout, framing and scroll geometry all come from the declared
// width/height, exactly as they do from ffprobe in production.
const PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
function stageAssets(outDir) {
  if (!withShots) return [];
  fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
  const put = (name) => { fs.writeFileSync(path.join(outDir, "assets", "images", name), PX); return `assets/images/${name}`; };
  return [
    { path: put("site_0.png"), type: "image", source: "website", visionOk: true, cdScore: 96, sceneId: "s3",
      width: 1440, height: 2600, ratio: 1440 / 2600, alt: "pricing page", sourceUrl: "https://northwind.example.com/pricing" },
    { path: put("site_1.png"), type: "image", source: "website", visionOk: true, cdScore: 92, sceneId: "s4",
      width: 430, height: 1400, ratio: 430 / 1400, alt: "mobile app" },
    { path: put("0.jpg"), type: "image", source: "upload", visionOk: true, cdScore: 88, sceneId: "s4",
      width: 1600, height: 1200, ratio: 4 / 3, alt: "team workspace" },
    { path: put("1.jpg"), type: "image", source: "upload", visionOk: true, cdScore: 84, sceneId: "s4",
      width: 1200, height: 1200, ratio: 1, alt: "product detail" },
    { path: put("logo.png"), type: "image", source: "upload", role: "logo", assetType: "logo",
      width: 512, height: 512, ratio: 1, alt: "Northwind logo" },
  ];
}

function buildOne(name) {
  const mod = require(PACKS[name]);
  const outDir = packArg === "all" ? path.join(outRoot, name) : outRoot;
  fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });
  const assets = stageAssets(outDir);
  const built = mod.buildComposition({
    storyboard, dims: { width: W, height: H, fps: 30 }, framePack: name,
    captionCues, assets, brandSkin, seedKey: "harness01",
  });
  fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
  fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");
  console.log(`[om-harness] ${name.padEnd(20)} -> ${outDir}  ${built.indexHtml.length}b · ` +
    `${(built.indexHtml.match(/<img /g) || []).length} img · ${(built.indexHtml.match(/class="clip/g) || []).length} clips · ` +
    `brand=${built.resolvedBrand ? built.resolvedBrand.accents.join("/") : "none"}`);
  return built;
}

if (packArg === "all") { for (const name of Object.keys(PACKS)) buildOne(name); }
else if (!PACKS[packArg]) { console.error(`unknown pack "${packArg}" — one of: ${Object.keys(PACKS).join(", ")}, or "all"`); process.exit(1); }
else buildOne(packArg);
