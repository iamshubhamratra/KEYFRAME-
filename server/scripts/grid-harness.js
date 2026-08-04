// DEV HARNESS — build a Grid Dispatch composition into a job dir. Usage:
//   node scripts/grid-harness.js <outDir> [W] [H] [#hex,#hex,...] [shots]
//     #hex list → an Art Director BRAND SKIN. grid-dispatch is a MONO pack: it wears ONE
//       accent, pushed DOWN in luminance to clear near-white paper (ensureInk), so a
//       skinned build must differ from a null build and report exactly one accent.
//     shots → stages placeholder captures at real aspect ratios so the fixed panel boxes,
//       the device screen, the attribution frame and the provenance greyscale rule are all
//       exercised with imagery that actually renders.
// Then: cd <outDir> && npx --yes hyperframes@<pinned> render --output renders/out.mp4 --quality draft
//
// The storyboard below is shaped to exercise the FULL SEVEN-SCENE SPINE: a hook, a bulleted
// problem, a solution beat carrying a URL, a four-point feature beat, a numeric benefits beat
// (two figures for the bars, three for the series), a quote with attribution, and a CTA. If a
// beat cannot carry its authored layout the spine skips that layout — so a harness that omits
// bullets or numbers silently tests a DIFFERENT film than the reference.

const fs = require("node:fs");
const path = require("node:path");
const grid = require("../src/services/grid_dispatch_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_gridtest");
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
  durationSec: 34.6,
  scenes: [
    { id: "s1", start: 0, duration: 5.6, purpose: "hook", kind: "hook",
      headline: "Your data finally makes sense", emphasis: "sense",
      onScreenText: ["Live dashboards", "No setup", "Any source"],
      voiceover: "Your data, finally making sense." },
    { id: "s2", start: 5.6, duration: 4.4, purpose: "problem", kind: "text",
      headline: "Reporting eats the week",
      onScreenText: ["Spreadsheet sprawl 5 tabs", "Stale numbers 2 days", "Manual rollups 6 hours", "Review rounds 4 rounds"],
      subtext: "Three days of copy-paste before anyone can decide anything.",
      voiceover: "Reporting eats a whole week of your team." },
    { id: "s3", start: 10, duration: 6.4, purpose: "feature", kind: "text",
      headline: "Connect once. Watch it build.", emphasis: "CONNECT",
      subtext: "https://northwind.io",
      onScreenText: ["Warehouse ready", "Reads your schema", "Live in minutes", "No SQL required"],
      voiceover: "Connect a source once, and watch the whole workspace build itself." },
    { id: "s4", start: 16.4, duration: 5.6, purpose: "how", kind: "text",
      headline: "You keep the pen",
      onScreenText: [
        "Rewrite a metric — change the definition, every chart follows",
        "Swap a chart — pick any view without touching the query",
        "Voice and captions — narration timed to the beat",
        "Publish anywhere — a link, an embed or a slide",
      ],
      voiceover: "You still keep the pen on every metric." },
    { id: "s5", start: 22, duration: 4.2, purpose: "data", kind: "stat",
      headline: "Numbers that hold up",
      onScreenText: ["92% faster close", "40 sources", "3 minute setup"],
      voiceover: "Ninety-two percent faster, across forty sources." },
    { id: "s6", start: 26.2, duration: 4.4, purpose: "proof", kind: "quote",
      headline: "We shipped the board deck in an afternoon", emphasis: "1 afternoon",
      subtext: "Priya N. — Head of Finance, Northwind",
      voiceover: "We shipped the whole board deck in one afternoon." },
    { id: "s7", start: 30.6, duration: 4, purpose: "cta", kind: "cta",
      headline: "Make the call", emphasis: "Start free", subtext: "Your first dashboard in three minutes. northwind.io",
      voiceover: "Start free — your first dashboard is three minutes away." },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({
  start: s.start + 0.35, end: s.start + s.duration - 0.35, text: s.voiceover || s.headline,
}));

const { stageAssets } = require("./lib/placeholder_assets");
const assets = withShots ? stageAssets(outDir, { sceneIds: ["s1", "s3", "s4"] }) : [];

const built = grid.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "grid-dispatch",
  captionCues, assets, brandSkin, seedKey: "harness01",
});
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");

const roles = grid.__test.assignRoles(storyboard.scenes, () => assets.length > 0);
console.log(`[grid-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes${withShots ? `, +${assets.length} assets` : ", no assets"}, brand=${brandSkin ? brandSkin.accents.join("/") : "none"})`);
console.log(`[grid-harness] spine: ${roles.join(" -> ")}`);
console.log(`[grid-harness] resolvedBrand: ${built.resolvedBrand ? built.resolvedBrand.accents.join(" ") : "null (unbranded — pack palette)"}`);
console.log(`[grid-harness] html ${built.indexHtml.length} bytes · ${(built.indexHtml.match(/<img /g) || []).length} <img> · ${(built.indexHtml.match(/class="clip/g) || []).length} clips`);
const missing = assets.filter((a) => a && a.path && !built.indexHtml.includes(a.path));
if (missing.length) console.log(`[grid-harness] !! ${missing.length} asset(s) placed but never drawn: ${missing.map((a) => path.basename(a.path)).join(", ")}`);
