// DEV HARNESS — build a Slab Stage composition into a job dir. Usage:
//   node scripts/slab-harness.js <outDir> [W] [H] [#hex,#hex,...] [shots]
//     #hex list → an Art Director BRAND SKIN. slab-stage wears TWO accents; a single-colour
//       skin derives its partner (hue +148), and both are re-graded per surface because the
//       pack renders light AND dark grounds in the same film.
//     shots → stages placeholder captures so the tour scenes' slab pairs, the provenance
//       greyscale rule and the breadth-first distribution are all exercised.
// Then: cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
//
// The storyboard exercises the FULL EIGHT-SCENE SPINE: hook, a bulleted problem, a plain
// promise beat, a brand beat, three asset-bearing tour beats, and a close.

const fs = require("node:fs");
const path = require("node:path");
const slab = require("../src/services/slab_stage_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_slabtest");
const W = Number(process.argv[3]) || 1080;
const H = Number(process.argv[4]) || 1920;
const brandHexes = String(process.argv[5] || "").split(",").map((s) => s.trim()).filter(Boolean);
const brandSkin = brandHexes.length
  ? { accents: brandHexes.slice(0, 3), emphasis: [brandHexes[0], brandHexes[1] || brandHexes[0]], source: "harness", provenance: "explicit" }
  : null;
const withShots = process.argv[6] === "shots";

fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

const storyboard = {
  title: "Northwind Analytics — the reporting layer for product teams",
  durationSec: 38.4,
  scenes: [
    { id: "s1", start: 0, duration: 5.0, purpose: "hook", kind: "hook",
      headline: "Your data finally makes sense", emphasis: "Northwind",
      onScreenText: ["Live dashboards", "No setup", "Any source"],
      voiceover: "Your data, finally making sense." },
    { id: "s2", start: 5.0, duration: 4.6, purpose: "problem", kind: "text",
      headline: "Reporting eats the week",
      onScreenText: ["Spreadsheet sprawl 5 tabs", "Stale numbers 2 days", "Manual rollups 6 hours"],
      subtext: "Three days of copy-paste before anyone can decide.",
      voiceover: "Reporting eats a whole week of your team." },
    { id: "s3", start: 9.6, duration: 4.2, purpose: "promise", kind: "text",
      headline: "One connection is the whole setup",
      voiceover: "One connection is the whole setup." },
    { id: "s4", start: 13.8, duration: 4.4, purpose: "brand", kind: "text",
      headline: "Built for teams that ship", emphasis: "Warehouse ready",
      voiceover: "Built for teams that ship." },
    { id: "s5", start: 18.2, duration: 5.2, purpose: "feature", kind: "text",
      headline: "It reads your schema",
      onScreenText: ["One source", "6 signals", "18 seconds"],
      voiceover: "It reads your schema in seconds." },
    { id: "s6", start: 23.4, duration: 5.0, purpose: "how", kind: "text",
      headline: "You keep the pen",
      onScreenText: ["Six beats", "Every line", "One click"],
      voiceover: "You still keep the pen on every metric." },
    { id: "s7", start: 28.4, duration: 5.0, purpose: "proof", kind: "text",
      headline: "Ship the board deck today",
      onScreenText: ["1080x1920", "Nine voices", "12 minutes"],
      voiceover: "Ship the board deck this afternoon." },
    { id: "s8", start: 33.4, duration: 5.0, purpose: "cta", kind: "cta",
      headline: "Northwind", emphasis: "Start free", subtext: "Your first dashboard in three minutes. northwind.io",
      voiceover: "Start free — your first dashboard is three minutes away." },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({
  start: s.start + 0.35, end: s.start + s.duration - 0.35, text: s.voiceover || s.headline,
}));

const { stageAssets } = require("./lib/placeholder_assets");
const assets = withShots ? stageAssets(outDir, { sceneIds: ["s5", "s6", "s7"] }) : [];

const built = slab.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "slab-stage",
  captionCues, assets, brandSkin, seedKey: "harness01",
});
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");

const roles = slab.__test.assignRoles(storyboard.scenes, assets.length);
console.log(`[slab-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes${withShots ? `, +${assets.length} assets` : ", no assets"}, brand=${brandSkin ? brandSkin.accents.join("/") : "none"})`);
console.log(`[slab-harness] spine: ${roles.join(" -> ")}`);
console.log(`[slab-harness] grounds: ${roles.map((x) => (slab.__test.ROLE[x] || {}).dark ? "DARK" : "light").join(" ")}`);
console.log(`[slab-harness] resolvedBrand: ${built.resolvedBrand ? built.resolvedBrand.accents.join(" ") : "null (unbranded — pack palette)"}`);
console.log(`[slab-harness] html ${built.indexHtml.length} bytes · ${(built.indexHtml.match(/<img /g) || []).length} <img> · ${(built.indexHtml.match(/class="clip/g) || []).length} clips`);
const missing = assets.filter((a) => a && a.path && !built.indexHtml.includes(a.path));
if (missing.length) console.log(`[slab-harness] !! ${missing.length} asset(s) placed but never drawn: ${missing.map((a) => path.basename(a.path)).join(", ")}`);
