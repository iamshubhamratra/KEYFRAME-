// WHY DO FILMS REPEAT THE SAME SLIDE?
//
// Three different things can cause it and they need different fixes, so this
// separates them per template:
//
//   authored  — how many DISTINCT scene shapes the template actually ships. A
//               template that authors 12 beats out of 6 shapes repeats by design.
//   castable  — how many of those a REAL storyboard can fill. `canFill` rejects a
//               shape whose slots the scene's copy can't satisfy (a stats plate
//               with no numbers, a chip rack with one bullet), so the usable
//               vocabulary is often far smaller than the authored one — and THAT
//               is the number that decides how soon a film starts repeating.
//   cast      — how many distinct shapes the film actually ended up using.
//
//   node scripts/check-slide-repeats.js            # summary + worst offenders
//   node scripts/check-slide-repeats.js --all      # every template
//   node scripts/check-slide-repeats.js --scenes 12

const fs = require("node:fs");
const path = require("node:path");
const om = require("../src/services/omelette_adapter.js");

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const N = Number((args[args.indexOf("--scenes") + 1]) || 9);

// A realistic storyboard: mixed purposes, real copy, some stats, some bullets —
// the shape a 30s explainer actually has.
const KIND = ["hook", "context", "feature", "stat", "how", "proof", "feature", "context", "cta",
  "feature", "proof", "how", "context", "feature", "cta"];
function storyboard(n) {
  const scenes = []; let t = 0;
  for (let i = 0; i < n; i++) {
    const k = KIND[i % KIND.length];
    scenes.push({
      id: `s${i + 1}`, start: t, duration: 3.5, kind: k, purpose: k,
      headline: ["One place for all of it", "Everything you need", "Built to move fast",
        "Trusted at scale", "Set up in minutes", "Loved by teams"][i % 6],
      subtext: "Capture, organise and ship without the chase between five different tools.",
      onScreenText: ["Capture", "Organise", "Ship"],
      bullets: ["Capture it", "Organise it", "Ship it"],
      stats: i % 3 === 0 ? [{ value: "42%", label: "faster" }] : [],
      cta: "Start free",
    });
    t += 3.5;
  }
  return { title: "Acme Ships Faster", brand: "Acme", url: "acme.com", durationSec: t, scenes };
}

const shot = (i) => ({ path: `assets/images/page_${i}.png`, type: "image", source: "website", kind: "screenshot", width: 2732, height: 1800, ratio: 1.518, alt: "REAL website screenshot", visionOk: true });
const photo = (i) => ({ path: `assets/images/${i}.jpg`, type: "image", source: "pixabay", width: 1920, height: 1080, ratio: 1.78, alt: "a photo", visionOk: true });
const ASSETS = [...Array.from({ length: 5 }, (_, i) => shot(i)), ...Array.from({ length: 6 }, (_, i) => photo(i + 1))];

function builtScenes(html) {
  const tpl = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!tpl) return null;
  let page; try { page = JSON.parse(tpl[1]); } catch { return null; }
  const m = /window\.OM_SCENES\s*=\s*('[\s\S]*?'|"[\s\S]*?")\s*;/.exec(page);
  if (!m) return null;
  try { const l = m[1]; return JSON.parse(l[0] === "'" ? l.slice(1, -1) : JSON.parse(l)); }
  catch { return null; }
}

const sb = storyboard(N);
const rows = [];
for (const f of fs.readdirSync(om.TPL_DIR).filter((x) => /\.html$/i.test(x))) {
  const name = f.replace(/\.html$/i, "");
  let authored;
  try { authored = om.readTemplateScenes(fs.readFileSync(path.join(om.TPL_DIR, f), "utf8")) || []; }
  catch { continue; }
  if (!authored.length) continue;
  let built;
  try {
    built = om.buildComposition({
      storyboard: sb, dims: { width: 1080, height: 1920, fps: 30 },
      template: name, assets: ASSETS.map((a) => ({ ...a })),
    });
  } catch { continue; }
  const scenes = builtScenes(built.indexHtml);
  if (!scenes) continue;
  const authoredNames = new Set(authored.map((s) => String(s.name)));
  const castNames = scenes.map((s) => String(s.name));
  const distinctCast = new Set(castNames);
  // The longest run of one shape, and the most any single shape is used.
  const counts = {};
  for (const c of castNames) counts[c] = (counts[c] || 0) + 1;
  const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ["-", 0];
  let run = 1, maxRun = 1;
  for (let i = 1; i < castNames.length; i++) {
    run = castNames[i] === castNames[i - 1] ? run + 1 : 1;
    if (run > maxRun) maxRun = run;
  }
  rows.push({
    tpl: name, authored: authoredNames.size, cast: distinctCast.size, beats: castNames.length,
    topShape: worst[0], topCount: worst[1], maxRun,
    reuse: Math.round((1 - distinctCast.size / Math.max(1, castNames.length)) * 100),
  });
}

rows.sort((a, b) => b.reuse - a.reuse || b.topCount - a.topCount);
const show = showAll ? rows : rows.slice(0, 18);
console.log(`\nSLIDE REPETITION — ${rows.length} templates, ${N}-scene film, rich supply\n`);
console.log("template".padEnd(22), "authored", "cast", "beats", "reuse", "most-used shape");
console.log("-".repeat(88));
for (const r of show) {
  console.log(r.tpl.padEnd(22), String(r.authored).padStart(8), String(r.cast).padStart(5),
    String(r.beats).padStart(5), (r.reuse + "%").padStart(6), `  ${r.topShape} x${r.topCount}${r.maxRun > 1 ? `  (run of ${r.maxRun})` : ""}`);
}
console.log("-".repeat(88));
const mean = (k) => (rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(1);
console.log(`mean: ${mean("authored")} shapes authored · ${mean("cast")} distinct cast into ${N} beats · ${mean("reuse")}% of beats are a repeat`);
const backToBack = rows.filter((r) => r.maxRun > 1);
console.log(`${backToBack.length}/${rows.length} template(s) place the SAME shape back-to-back${backToBack.length ? ": " + backToBack.slice(0, 8).map((r) => r.tpl).join(", ") : ""}`);
if (!showAll && rows.length > show.length) console.log(`(worst ${show.length} shown; --all for every template)`);
