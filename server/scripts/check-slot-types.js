// TYPE-CONFORMANCE GATE — can any bundled template be handed a prop it will
// throw on?
//
// The failure this exists to catch is total and silent: a compiled scene
// component reads an authored-array prop with `.map()`, so a string in that slot
// throws inside React and the engine paints its error slate — a flat coloured
// frame with a red "words.map is not a function" pill — for that scene AND every
// scene after it. A measured 36s film ran correctly to 21.9s and was that slate
// for its last 14 seconds; the lint, contrast, identity and media gates all
// passed it, because the markup is perfectly well-formed. Only QA's vision pass
// noticed, after the render had already been paid for.
//
// So this checks the one thing that can be checked statically: every value the
// adapter writes into a scene must match the TYPE the template authored for that
// key. Runs over every template x several storyboard shapes, costs no render.
//
//   node scripts/check-slot-types.js          # all templates
//   node scripts/check-slot-types.js --verbose

const fs = require("node:fs");
const path = require("node:path");
const om = require("../src/services/omelette_adapter.js");

const verbose = process.argv.includes("--verbose");

// Storyboard shapes that between them exercise every fallback path: rich copy,
// bullet-less scenes (the case that broke Bluesite — `words` fell through to a
// string because no bullet survived fitLabel), long sentences, and bare scenes.
function storyboards() {
  const mk = (n, f) => {
    const scenes = []; let t = 0;
    for (let i = 0; i < n; i++) { scenes.push({ id: `s${i + 1}`, start: t, duration: 3, ...f(i) }); t += 3; }
    return { title: "Acme Ships Faster", brand: "Acme", url: "acme.com", durationSec: t, scenes };
  };
  const KIND = ["hook", "feature", "stat", "quote", "proof", "how", "context", "cta"];
  return [
    ["rich", mk(10, (i) => ({
      kind: KIND[i % 8], purpose: KIND[i % 8], headline: "One place for all of it",
      emphasis: "all", subtext: "Capture, organise and ship without the chase.",
      onScreenText: ["Capture", "Organise", "Ship"], bullets: ["Capture it", "Organise it", "Ship it"],
      stats: [{ value: "42%", label: "faster" }], cta: "Start free",
    }))],
    // NO BULLETS + one long sentence: every asSlot returns undefined and each
    // writer falls back. This is the shape that shipped the crash.
    ["no-bullets", mk(10, (i) => ({
      kind: KIND[i % 8], purpose: KIND[i % 8],
      headline: "India's ultimate one-stop destination for everything you need today",
      subtext: "Seventy five percent of organizations report value within the first thirty days of use.",
      onScreenText: [], bullets: [],
    }))],
    // Bare scenes: nothing but a kind. Every slot falls back or blanks.
    ["bare", mk(8, (i) => ({ kind: KIND[i % 8], purpose: KIND[i % 8] }))],
  ];
}

const shot = (i) => ({ path: `assets/images/page_${i}.png`, type: "image", source: "website", kind: "screenshot", width: 2732, height: 1800, ratio: 1.518, alt: "REAL website screenshot", visionOk: true });
const photo = (i) => ({ path: `assets/images/${i}.jpg`, type: "image", source: "pixabay", width: 1920, height: 1080, ratio: 1.78, alt: "a photo", visionOk: true });
const vector = (i) => ({ path: `assets/images/icon_${i}.svg`, type: "image", source: "iconify", alt: "an icon", visionOk: true });
const ASSETS = [
  ...Array.from({ length: 6 }, (_, i) => shot(i)),
  ...Array.from({ length: 6 }, (_, i) => photo(i + 1)),
  ...Array.from({ length: 3 }, (_, i) => vector(i + 1)),
];

// Read back the scene payload the compiled film will actually receive.
function builtScenes(html) {
  const tpl = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!tpl) return null;
  let page; try { page = JSON.parse(tpl[1]); } catch { return null; }
  const m = /window\.OM_SCENES\s*=\s*('[\s\S]*?'|"[\s\S]*?")\s*;/.exec(page);
  if (!m) return null;
  try {
    const lit = m[1];
    return JSON.parse(lit[0] === "'" ? lit.slice(1, -1) : JSON.parse(lit));
  } catch { return null; }
}

const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

const files = fs.readdirSync(om.TPL_DIR).filter((f) => /\.html$/i.test(f));
const failures = [];
let checked = 0, scenesChecked = 0;

for (const f of files) {
  const name = f.replace(/\.html$/i, "");
  let authored;
  try { authored = om.readTemplateScenes(fs.readFileSync(path.join(om.TPL_DIR, f), "utf8")); }
  catch (e) { failures.push({ tpl: name, sb: "-", why: `unreadable: ${e.message}` }); continue; }
  if (!authored || !authored.length) { failures.push({ tpl: name, sb: "-", why: "exposes no OM_SCENES" }); continue; }
  // Authored type per slot NAME — a scene shape is matched back by `name`.
  const byName = new Map(authored.map((s) => [String(s.name), s]));

  for (const [label, sb] of storyboards()) {
    let built;
    try {
      built = om.buildComposition({
        storyboard: sb, dims: { width: 1080, height: 1920, fps: 30 },
        template: name, assets: ASSETS.map((a) => ({ ...a })),
      });
    } catch (e) { failures.push({ tpl: name, sb: label, why: `threw: ${String(e.message).slice(0, 80)}` }); continue; }
    checked++;
    const scenes = builtScenes(built.indexHtml);
    if (!scenes) { failures.push({ tpl: name, sb: label, why: "no OM_SCENES in the built film" }); continue; }
    for (const s of scenes) {
      scenesChecked++;
      const proto = byName.get(String(s.name));
      if (!proto) continue;
      for (const [k, v] of Object.entries(s)) {
        if (proto[k] === undefined || proto[k] === null || v === undefined || v === null) continue;
        const want = typeOf(proto[k]), got = typeOf(v);
        // number/string is benign (React prints either); array/string is fatal.
        if (want === got) continue;
        if ((want === "array") !== (got === "array")) {
          failures.push({ tpl: name, sb: label, why: `scene "${s.name}" slot "${k}": template authored ${want}, adapter wrote ${got}` });
        }
      }
    }
  }
}

console.log(`\n${files.length} template(s) x ${storyboards().length} storyboard shape(s) — ${checked} composition(s), ${scenesChecked} scene(s) checked\n`);
if (!failures.length) {
  console.log("PASS — every slot matches the type its template authored (no film can crash on .map)");
  process.exit(0);
}
const shown = verbose ? failures : failures.slice(0, 40);
for (const x of shown) console.log(`  FAIL  ${x.tpl.padEnd(22)} [${x.sb}]  ${x.why}`);
if (failures.length > shown.length) console.log(`  … and ${failures.length - shown.length} more (--verbose for all)`);
console.log(`\n${failures.length} type mismatch(es) — each one blanks its film from that scene to the end.`);
process.exit(1);
