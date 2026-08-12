// Media DENSITY report — how much of a film actually carries imagery.
//
// Distinct from scripts/media_demand.test.cjs, which asserts NO-DRIFT (planMedia
// and the rendered DOM agree). Two films can both be perfectly drift-free while
// one shows six images and the other shows one: drift is about correctness of
// filling, density is about how many slots exist to fill at all.
//
// This is the measuring stick for widening the scene grammars. Run before and
// after any mediaSlots/route change:
//   node scripts/media-density.js            (all packs, landscape)
//   node scripts/media-density.js portrait
//   node scripts/media-density.js --pack retro-terminal

const E = require("../src/services/template_engine");
const { scanCoverage } = require("../src/services/media_fill");

const COMPOSERS = {
  "story-blocks": "storyblocks_composer", "hype-wave": "hype_composer",
  "premiere-night": "premiere_composer", "lantern-night": "lantern_composer",
  "daybreak-bakehouse": "daybreak_composer", "poster-pop": "posterpop_composer",
  "organic-garden": "organic_composer",
  "bright-minimal": "family_bright", "charged": "family_charged", "cinema": "family_cinema",
  "dark-premium": "family_darkpremium", "editorial-quiet": "family_editorial",
  "poster-loud": "family_poster", "story-handmade": "family_story", "retro-terminal": "family_terminal",
};

// A realistic 8-scene film — the shape a 30-60s video actually has.
const KINDS = ["hook", "text", "stat", "quote", "text", "feature", "text", "cta"];
function storyboard(n = 8) {
  const scenes = []; let t = 0;
  for (let i = 0; i < n; i++) {
    scenes.push({
      id: `s${i + 1}`, start: t, duration: 5, kind: KINDS[i % KINDS.length], purpose: KINDS[i % KINDS.length],
      headline: "A real headline here", emphasis: "real", subtext: "a supporting line",
      onScreenText: ["one two three", "four five six", "seven eight nine"],
    });
    t += 5;
  }
  return { title: "Test Film", brand: "Acme", durationSec: t, scenes };
}
const shot = (i, sceneId, portrait = false) => ({
  path: `assets/images/page_${i}.png`, type: "image", source: "website", sceneId,
  width: portrait ? 780 : 2732, height: portrait ? 1688 : 1800,
  ratio: portrait ? 780 / 1688 : 2732 / 1800, alt: "REAL website screenshot",
});
const photo = (i) => ({
  path: `assets/images/${i}.jpg`, type: "image", source: "pixabay", visionOk: true,
  width: 1920, height: 1080, ratio: 16 / 9, alt: "a photo",
});
const vector = (i) => ({
  path: `assets/images/icon_${i}.svg`, type: "image", source: "iconify", visionOk: true, alt: "an icon",
});

// RICH supply — what an asset-hungry film should be able to draw on: 3 real page
// shots (one portrait), 9 photos, 4 vectors. If a pack still shows one image
// here, the ceiling is the grammar, not the supply.
function richSupply() {
  return [
    shot(0, null), shot(1, null), shot(2, null, true),
    ...Array.from({ length: 9 }, (_, i) => photo(i + 1)),
    ...Array.from({ length: 4 }, (_, i) => vector(i + 1)),
  ];
}

const args = process.argv.slice(2);
const portrait = args.includes("portrait");
const onlyPack = (args.indexOf("--pack") >= 0) ? args[args.indexOf("--pack") + 1] : null;
const dims = portrait ? { width: 1080, height: 1920, fps: 30 } : { width: 1920, height: 1080, fps: 30 };

const assets = richSupply();
const rows = [];
for (const [pack, mod] of Object.entries(COMPOSERS)) {
  if (onlyPack && pack !== onlyPack) continue;
  let composer;
  try { composer = require(`../src/services/${mod}`); }
  catch (e) { rows.push({ pack, err: String(e.message).slice(0, 50) }); continue; }
  const opts = { storyboard: storyboard(), dims, framePack: pack, assets, captionCues: [] };
  try {
    const P = composer.planMedia(opts);
    const dom = scanCoverage(composer.buildComposition(opts).indexHtml).totals;
    const scenes = P.plan.length;
    // Scenes whose TYPE asks for at least one media slot.
    const mediaScenes = P.plan.filter((p) => (p.need || []).length > 0).length;
    const types = P.plan.map((p) => p.type);
    rows.push({
      pack, scenes, mediaScenes,
      demand: dom.demand, filled: dom.filled, imgs: dom.imgs,
      pct: scenes ? Math.round((mediaScenes / scenes) * 100) : 0,
      types: [...new Set(types)].join(","),
    });
  } catch (e) {
    rows.push({ pack, err: String(e.message).slice(0, 50) });
  }
}

console.log(`\nMEDIA DENSITY — ${portrait ? "portrait" : "landscape"}, 8-scene film, rich supply (${assets.length} assets)\n`);
console.log("pack".padEnd(20) + "scenes".padEnd(8) + "media".padEnd(7) + "%".padEnd(6) + "demand".padEnd(8) + "filled".padEnd(8) + "imgs");
console.log("-".repeat(72));
let tScenes = 0, tMedia = 0, tFilled = 0;
for (const r of rows) {
  if (r.err) { console.log(r.pack.padEnd(20) + "ERROR: " + r.err); continue; }
  tScenes += r.scenes; tMedia += r.mediaScenes; tFilled += r.filled;
  console.log(
    r.pack.padEnd(20) + String(r.scenes).padEnd(8) + String(r.mediaScenes).padEnd(7)
    + (r.pct + "%").padEnd(6) + String(r.demand).padEnd(8) + String(r.filled).padEnd(8) + String(r.imgs)
  );
}
console.log("-".repeat(72));
console.log(`TOTAL${" ".repeat(15)}${String(tScenes).padEnd(8)}${String(tMedia).padEnd(7)}${(tScenes ? Math.round((tMedia / tScenes) * 100) : 0) + "%"}`);
const packs = rows.filter((r) => !r.err).length;
console.log(`\n${tMedia}/${tScenes} scenes carry media across ${packs} pack(s); `
  + `${packs ? (tFilled / packs).toFixed(1) : 0} assets placed per film on average `
  + `(${assets.length} supplied to each).\n`);
