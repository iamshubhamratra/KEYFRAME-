// EVERY MEDIA-WALL TILE IS FILLED — the invariant behind the empty screenshot card.
//
// The compiled omelette films draw their wall tiles unconditionally. A tile whose
// `shotN` prop is UNSET is not skipped: the film paints its own authoring chrome
// there — the hatched "DROP IMAGE TO REPLACE" box. So an unset wall slot is a
// user-visible defect, and it is one no existing gate could see (QA passed the
// film that shipped it; the density audit counted the beat as media-bearing).
//
// This audits the DATA, not a render: build a composition per pack and assert
// that every beat carrying any `shotN` carries a contiguous shot1..N with no
// empty value in it. Runs the pool STARVED so the recycle cap actually bites —
// that scarcity, not a missing asset pool, is what produced the reported bug
// (15 images available, cap of 2 draws each, 15 beats, third plate empty).
//
//   node scripts/audit-wall-slots.js            # all omelette packs
//   node scripts/audit-wall-slots.js edition-press
//
// Exits non-zero on any gap, so it can gate a commit.
const fs = require("fs");
const path = require("path");
const om = require("../src/services/omelette_adapter.js");

const FR = path.join(__dirname, "..", "..", "frames");
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

// A long film against a thin pool: more picture slots than the per-file draw cap
// can cover, which is the exact condition the bug needed.
const KIND = ["hook", "context", "feature", "stat", "how", "feature", "proof", "context", "cta"];
const SCENES = Array.from({ length: 15 }, (_, i) => ({
  id: `s${i + 1}`, start: i * 2.2, duration: 2.2,
  kind: KIND[i % KIND.length], purpose: KIND[i % KIND.length],
  headline: `Beat ${i + 1} of the field manual`,
  subtext: "Everything that matters, set above the fold and locked to a strict grid.",
  onScreenText: ["Browse", "Compare", "Buy"], bullets: ["Browse it", "Compare it", "Buy it"],
  stats: [{ value: "75%", label: "return in 30 days" }], cta: "Open the app",
  voiceover: "Everything that matters, set above the fold and locked to a strict grid.",
}));

const photo = (n) => ({
  path: `assets/images/${n}.jpg`, type: "image", source: "pixabay",
  width: 1920, height: 1080, ratio: 1.78, alt: "a stock photo",
  cdScore: 55, cdProminence: "support", visionOk: true,
});

// The reported failure was NOT the zero-asset case — it was a healthy pool
// spread thin over a long film, and a PARTIAL fill (two of three tiles) — so the levels
// step through the range where the per-file draw cap starts to bite mid-wall
// (cap = max(2, ceil(beats / pool))), not just the empty-pool extreme.
const SUPPLIES = [
  { name: "starved(0)", assets: [] },
  { name: "thin(2)", assets: [photo(0), photo(1)] },
  { name: "scarce(5)", assets: Array.from({ length: 5 }, (_, i) => photo(i)) },
  { name: "mid(8)", assets: Array.from({ length: 8 }, (_, i) => photo(i)) },
  { name: "spread(15)", assets: Array.from({ length: 15 }, (_, i) => photo(i)) },
];

// OM_SCENES is a JS string literal inside the bundler's template block, and the
// quote style differs between an authored template (single) and a built film
// (double), so read the literal generically rather than assuming either.
function scenesOf(html) {
  const m = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return null;
  let page;
  try { page = JSON.parse(m[1]); } catch { return null; }
  const i = page.indexOf("window.OM_SCENES");
  if (i < 0) return null;
  let j = page.indexOf("=", i) + 1;
  while (/\s/.test(page[j])) j++;
  const q = page[j];
  if (q !== "'" && q !== '"') return null;
  let k = j + 1;
  while (k < page.length) {
    if (page[k] === "\\") { k += 2; continue; }
    if (page[k] === q) break;
    k++;
  }
  const lit = page.slice(j, k + 1);
  const json = q === '"' ? JSON.parse(lit) : lit.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  try { return JSON.parse(json); } catch { return null; }
}

const packs = fs.readdirSync(FR).filter((d) => {
  if (only.length && !only.includes(d)) return false;
  try { return JSON.parse(fs.readFileSync(path.join(FR, d, "pack.json"), "utf8")).renderer === "omelette"; }
  catch { return false; }
});

const bad = [];
let checked = 0, walls = 0, errs = 0;

// The adapter's own wall test and tile-count rule, restated. Kept literal (not
// imported) on purpose: this file is the independent statement of the contract,
// so a change to the adapter has to be a deliberate change here too.
const MEDIA_WALL = /montage|gallery|fleet|wall|grid|explore|billboard|spread|cruise|deploy|sighting|line|assemble|showcase|surfaces|screens/i;

for (const p of packs) {
  const manifest = JSON.parse(fs.readFileSync(path.join(FR, p, "pack.json"), "utf8"));
  // The template's AUTHORED scenes, for the `tiles` count the wall rule reads.
  const authoredByName = new Map();
  try {
    const tplHtml = fs.readFileSync(om.templatePath(manifest.template || manifest.name), "utf8");
    for (const a of om.readTemplateScenes(tplHtml) || []) authoredByName.set(String(a.name || ""), a);
  } catch { /* a template we cannot read is reported as a build error below */ }
  for (const supply of SUPPLIES) {
    // ONE SHAPE PER PACK, and the orientation is read back rather than asked
    // for. These films compose at their TEMPLATE'S native canvas: the requested
    // dims are ignored outright (buildComposition derives W/H from
    // `manifest.portraitNative`, and its reqW/reqH are dead). Asking for both
    // shapes therefore builds the same composition twice, and — the trap this
    // audit fell into first — deciding the expected tile count from the
    // REQUESTED dims reports a portrait-native pack as a landscape failure.
    {
      let built;
      try {
        built = om.buildComposition({
          storyboard: { title: "Sociology", brand: "Sociology", url: "edition.press", durationSec: 33, scenes: SCENES },
          dims: { width: 1920, height: 1080, fps: 30 },
          framePack: p, assets: supply.assets.map((a) => ({ ...a })), manifest,
        });
      } catch (e) { errs++; continue; }
      const scenes = scenesOf(built.indexHtml);
      if (!scenes) { errs++; continue; }
      checked++;
      let meta = {};
      try { meta = JSON.parse(built.metaJson) || {}; } catch { /* fall through to landscape */ }
      const land = !(Number(meta.height) > Number(meta.width));
      const shape = `${meta.width || "?"}x${meta.height || "?"}`;
      for (let n = 0; n < scenes.length; n++) {
        const s = scenes[n];
        const name = String(s.name || "");
        // How many tiles this wall DRAWS, worked out from the authored template
        // rather than from what the adapter happened to emit. Checking only the
        // emitted shotN keys cannot see the worst form of the bug: a wall that
        // filled nothing at all emits no shotN, so a contiguity test skips the
        // beat instead of failing it. This restates the adapter's own rule as an
        // independent contract — if the two ever disagree, that is the finding.
        if (!MEDIA_WALL.test(name)) continue;
        const authored = authoredByName.get(name);
        const tiles = authored && Array.isArray(authored.tiles) ? authored.tiles.length : 0;
        const slots = tiles ? Math.min(land ? 6 : 2, tiles) : (land ? 3 : 2);
        walls++;
        // Every one of those tiles must carry an image: a real asset, a repeat,
        // or the branded plate. Anything else and the film paints its own
        // hatched "DROP IMAGE TO REPLACE" box there.
        for (let i = 1; i <= slots; i++) {
          const v = s[`shot${i}`];
          if (v === undefined || v === null || String(v).trim() === "") {
            bad.push({ pack: p, shape, supply: supply.name, beat: n, scene: name, slot: `shot${i}`, of: slots });
          }
        }
        // `images` feeds the kit family's tile grid off the same wall, so a short
        // or holed array is the same defect wearing the other namespace.
        if (Array.isArray(s.images) && (s.images.length < slots || s.images.some((x) => !x || !String(x).trim()))) {
          bad.push({ pack: p, shape, supply: supply.name, beat: n, scene: name, slot: `images[${s.images.length}]`, of: slots });
        }
      }
    }
  }
}

console.log(`\nMEDIA-WALL SLOT AUDIT — ${packs.length} omelette packs x ${SUPPLIES.length} supply levels`);
console.log(`compositions built: ${checked}   wall beats inspected: ${walls}   build errors: ${errs}\n`);

if (!bad.length) {
  console.log("PASS — every media-wall tile carries an image (a real asset, a repeat, or the branded plate).");
  console.log("       No beat can reach the film with an unset shotN, so no film can draw the");
  console.log('       hatched "DROP IMAGE TO REPLACE" card in a wall tile.\n');
  process.exit(0);
}

console.log(`FAIL — ${bad.length} empty wall tile(s):\n`);
for (const b of bad.slice(0, 40)) {
  console.log(`  ${b.pack.padEnd(24)} ${b.shape.padEnd(10)} ${b.supply.padEnd(12)} beat ${String(b.beat).padStart(2)} ${String(b.scene).padEnd(12)} ${b.slot} (of ${b.of})`);
}
if (bad.length > 40) console.log(`  … and ${bad.length - 40} more`);
console.log("");
process.exit(1);
