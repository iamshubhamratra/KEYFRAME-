// DEV HARNESS — build a Three.js/WebGL composition into a job dir for standalone render.
// Usage: node scripts/three-harness.js <outDir> [packId] [ui|shot|none] [W] [H] [#hex,#hex,...]
//   ui   → no assets (exercises the drawn retro-desktop fallback on the CRT screen)
//   shot → include a real website screenshot (exercises the CRT/reveal plate texture)
//   #hex,#hex,... → an Art Director brand skin, to check accents follow the brand
// Then render:  cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2
//
// Takes a packId because render3d is opt-in on ANY of the 31 packs — the composer
// reads the pack's camera3d ground, display face and accents through deriveTheme,
// so the pack is a real variable here, not a constant like it is for flagship.

const fs = require("node:fs");
const path = require("node:path");
const three = require("../src/services/three_composer");

const outDir = path.resolve(process.argv[2] || "jobs/_3dtest");
const pack = process.argv[3] || "flagship";
const mode = process.argv[4] || "shot";
const W = Number(process.argv[5]) || 1280;
const H = Number(process.argv[6]) || 720;

fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

// A realistic SaaS launch storyboard exercising the treatment rotation: scene 1
// lands on hero and scene 6 on burst (first/last are forced), s5's "10x" trips
// the digit→grid rule, and the interior scenes ride the seeded orbit/crt/reveal/
// tunnel/grid rotation.
const storyboard = {
  title: "ORBIT",
  durationSec: 18,
  scenes: [
    { id: "s1", start: 0,  duration: 3, purpose: "hook",     kind: "hook",  headline: "Ship faster",                       emphasis: "faster",    subtext: "The launch platform for modern product teams." },
    { id: "s2", start: 3,  duration: 3, purpose: "problem",  kind: "text",  headline: "Your data is scattered everywhere", emphasis: "scattered" },
    { id: "s3", start: 6,  duration: 3, purpose: "solution", kind: "text",  headline: "One clean dashboard",               emphasis: "clean",     subtext: "Every metric, live, in one place." },
    { id: "s4", start: 9,  duration: 3, purpose: "features", kind: "text",  headline: "Built for teams",                   emphasis: "teams",     subtext: "Roles, reviews and realtime sync." },
    { id: "s5", start: 12, duration: 3, purpose: "benefits", kind: "stat",  headline: "faster decisions",                  emphasis: "10x",       subtext: "10x" },
    { id: "s6", start: 15, duration: 3, purpose: "cta",      kind: "cta",   headline: "Start today",                       emphasis: "today",     subtext: "orbit.app" },
  ],
};

// Job dirs are gitignored scratch, so a hardcoded fixture path rots as soon as the
// job is cleaned up (the sibling harnesses already point at dirs that are gone).
// Find the newest job that still holds real website screenshots instead.
function findShotDir() {
  const root = path.resolve("jobs");
  if (!fs.existsSync(root)) return null;
  return fs.readdirSync(root)
    .map((n) => path.join(root, n, "assets", "images"))
    .filter((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => /^site_.*\.png$/i.test(f)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

let assets = [];
if (mode === "shot") {
  const src = findShotDir();
  const names = src ? fs.readdirSync(src).filter((f) => /^site_.*\.png$/i.test(f)) : [];
  names.forEach((n, i) => {
    fs.copyFileSync(path.join(src, n), path.join(outDir, "assets", "images", n));
    // Only the first (source:"website") ever reaches the screen — this composer
    // textures ONE plate and drops the rest. The extras are here so the harness
    // still exercises the pool ranking that picks that one.
    assets.push({
      path: `assets/images/${n}`, type: "image",
      source: i === 0 ? "website" : "pixabay", visionOk: true,
      alt: i === 0 ? "product dashboard screenshot" : "supporting product visual",
      sceneId: null, width: 1440, height: 900, ratio: 1.6,
    });
  });
  if (!names.length) console.warn("[harness] mode=shot but no jobs/*/assets/images/site_*.png found — falling back to the drawn screen");
}

// The skin the Art Director hands the composer for a real job: accent-only, in the
// same {accents, emphasis} shape art_director.js emits, so the harness exercises
// the production contract rather than a bespoke one. Absent → null, which must be
// a no-op (the pack keeps its own accents).
const brandArg = String(process.argv[7] || "");
const accents = brandArg.split(",")
  .map((s) => s.trim())
  .filter((s) => /^#?[0-9a-fA-F]{6}$/.test(s))
  .map((s) => `#${s.replace("#", "").toLowerCase()}`)
  .slice(0, 3);
const brandSkin = accents.length
  ? { accents, emphasis: [accents[0], accents[1] || accents[0]], reason: "harness override", source: "harness" }
  : null;

const { indexHtml, metaJson } = three.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: pack, assets, brandSkin,
});
fs.writeFileSync(path.join(outDir, "index.html"), indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), metaJson, "utf8");
console.log(`[harness] wrote ${outDir} (pack=${pack}, mode=${mode}, ${W}x${H}, ${assets.length} assets${brandSkin ? `, brand=${accents.join(",")}` : ""})`);
