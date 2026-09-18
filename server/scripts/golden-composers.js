// GOLDEN COMPOSERS — the byte-identity gate the engine's comments already assume exists.
//
//   node scripts/golden-composers.js --save               # write the baseline
//   node scripts/golden-composers.js --check              # fail (exit 1) on any drift
//   node scripts/golden-composers.js --check --stage landscape
//
// film_beats.js:34 and film_stage.js:951 both claim their changes are "byte-identical across
// all 89 shipped FilmKit packs, proved by scripts/golden-composers.js". That script was never
// in the tree, so the claim was documentation rather than a gate — and the portrait redesign
// is precisely the change that needs one, because its whole safety argument is "every edit is
// behind `if (WIDE) return`, so the 9 landscape skins cannot move".
//
// This builds EVERY skin in services/film_skins at one authored stage and hashes the emitted
// composition. The build is synchronous and seeded (`mulberry32(seedFrom(seedKey))`), so with a
// fixed seedKey the output is deterministic and any hash change is a real change.
//
//   --stage landscape   hash only the stage:"landscape" skins, at 1920x1080. This is the
//                       NON-REGRESSION gate for the horizontal templates.
//   --stage portrait    hash the portrait skins at 1080x1920. Expected to change whenever the
//                       9:16 compositions are deliberately redesigned; re-save then.
//   --stage all         both.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (n, d) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };

const STAGE = String(opt("--stage", "landscape")).toLowerCase();
const SKINS_DIR = path.join(__dirname, "..", "src", "services", "film_skins");
const OUT = path.resolve(opt("--file", path.join(__dirname, `golden-composers.${STAGE}.json`)));
const SEED = opt("--seed", "golden-composers");

// A storyboard broad enough to reach every builder: hook, feature, stat, problem/statement,
// quote, body, montage/showcase and cta, twice over so the archetype variety pass and the
// mechanic rotation both engage.
const storyboard = {
  title: "Golden Reference Film",
  durationSec: 96,
  scenes: [
    { id: "g1", start: 0, duration: 6, kind: "hook", purpose: "hook", kicker: "REFERENCE", headline: "A golden|reference", subtext: "Every builder, one film.", onScreenText: ["One", "Two"] },
    { id: "g2", start: 6, duration: 6, kind: "feature", purpose: "feature", headline: "Feature beat", subtext: "The hero card.", onScreenText: ["Alpha", "Beta", "Gamma"] },
    { id: "g3", start: 12, duration: 6, kind: "stat", purpose: "proof", headline: "Proof beat", emphasis: "72%", subtext: "72% faster", onScreenText: ["72% faster", "3x demos", "18 day payback"] },
    { id: "g4", start: 18, duration: 6, kind: "problem", purpose: "problem", headline: "Statement beat", subtext: "The problem, stated once.", onScreenText: ["One line"] },
    { id: "g5", start: 24, duration: 6, kind: "quote", purpose: "quote", headline: "Quote beat", quote: "A quoted line.", subtext: "Attribution" },
    { id: "g6", start: 30, duration: 6, kind: "showcase", purpose: "montage", headline: "Montage beat", subtext: "Four ways.", onScreenText: ["One", "Two", "Three", "Four"] },
    { id: "g7", start: 36, duration: 6, kind: "body", purpose: "explain", title: "Body beat", body: "A paragraph of reference prose that runs long enough to wrap onto several lines in either aspect." },
    { id: "g8", start: 42, duration: 6, kind: "feature", purpose: "how", headline: "How beat", subtext: "Three moves.", onScreenText: ["Open", "Prove", "Close"] },
    { id: "g9", start: 48, duration: 6, kind: "problem", purpose: "comparison", headline: "Compare beat", subtext: "Two things.", onScreenText: ["This vs that"] },
    { id: "g10", start: 54, duration: 6, kind: "stat", purpose: "proof", headline: "Second proof", emphasis: "2.4x", subtext: "2.4x watch", onScreenText: ["2.4x watch", "41% lower", "9 of 10"] },
    { id: "g11", start: 60, duration: 6, kind: "showcase", purpose: "gallery", headline: "Gallery beat", subtext: "A wall.", onScreenText: ["A", "B", "C", "D"] },
    { id: "g12", start: 66, duration: 6, kind: "problem", purpose: "problem", headline: "Third statement", subtext: "Said again." },
    { id: "g13", start: 72, duration: 6, kind: "feature", purpose: "product", headline: "Product beat", subtext: "The thing itself.", onScreenText: ["Native", "Large", "Real"] },
    { id: "g14", start: 78, duration: 6, kind: "body", purpose: "explain", title: "Second body", body: "More reference prose, again long enough to wrap." },
    { id: "g15", start: 84, duration: 6, kind: "problem", purpose: "problem", headline: "Fourth statement", subtext: "And once more." },
    { id: "g16", start: 90, duration: 6, kind: "cta", purpose: "cta", headline: "Closing beat", subtext: "No card needed.", cta: "Get Started" },
  ],
};

// Fixture assets covering the shapes the pipeline really produces: a wide page capture, a
// landscape still, a portrait photo and a square mark. Paths need not exist — nothing is
// loaded, only the geometry decisions are hashed.
const assets = [
  { path: "assets/images/site_0.png", type: "image", source: "website", kindHint: "screenshot", width: 2732, height: 1800, ratio: 2732 / 1800, alt: "capture one", visionOk: true },
  { path: "assets/images/site_1.png", type: "image", source: "website", kindHint: "screenshot", width: 2732, height: 1800, ratio: 2732 / 1800, alt: "capture two", visionOk: true },
  { path: "assets/images/site_2.png", type: "image", source: "website", kindHint: "screenshot", width: 2732, height: 1800, ratio: 2732 / 1800, alt: "capture three", visionOk: true },
  { path: "assets/images/wide.webp", type: "image", source: "website", kindHint: "photo", width: 1920, height: 1080, ratio: 16 / 9, alt: "still one", visionOk: true },
  { path: "assets/images/wide2.webp", type: "image", source: "website", kindHint: "photo", width: 768, height: 448, ratio: 768 / 448, alt: "still two", visionOk: true },
  { path: "assets/images/tall.jpg", type: "image", source: "pixabay", kindHint: "photo", width: 853, height: 1280, ratio: 853 / 1280, alt: "portrait photo", visionOk: true },
  { path: "assets/images/logo.png", type: "image", source: "upload", kindHint: "logo", role: "logo", width: 512, height: 512, ratio: 1, alt: "logo", visionOk: true },
];

function skinFiles() {
  return fs.readdirSync(SKINS_DIR)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
    .sort();
}

// A composition's hash, minus the one thing that legitimately differs per checkout: the
// base64 font payloads, which are large, identical across skins sharing a face, and not part
// of the layout under test.
function hashOf(html) {
  const body = String(html).replace(/base64,[A-Za-z0-9+/=]{200,}/g, "base64,<FONT>");
  return crypto.createHash("sha256").update(body).digest("hex").slice(0, 32);
}

function buildAll(stageName) {
  const dims = stageName === "landscape" ? { width: 1920, height: 1080, fps: 30 } : { width: 1080, height: 1920, fps: 30 };
  const out = {};
  const errors = [];
  for (const f of skinFiles()) {
    const id = f.replace(/\.js$/, "");
    let mod;
    try { mod = require(path.join(SKINS_DIR, f)); } catch (e) { errors.push(`${id}: require ${e.message}`); continue; }
    const authored = (mod.SKIN && mod.SKIN.stage) || "portrait";
    if (authored !== stageName) continue;
    try {
      const comp = mod.buildComposition({ storyboard, dims, assets, seedKey: SEED });
      const html = comp.indexHtml || comp.html || "";
      if (!html) { errors.push(`${id}: empty composition`); continue; }
      out[id] = { hash: hashOf(html), bytes: html.length };
    } catch (e) {
      errors.push(`${id}: build ${e.message}`);
    }
  }
  return { hashes: out, errors };
}

const stages = STAGE === "all" ? ["landscape", "portrait"] : [STAGE];
let failed = false;

for (const st of stages) {
  const file = STAGE === "all" ? path.join(__dirname, `golden-composers.${st}.json`) : OUT;
  const { hashes, errors } = buildAll(st);
  const n = Object.keys(hashes).length;
  for (const e of errors) { console.error(`  ERROR ${e}`); failed = true; }

  if (has("--save")) {
    fs.writeFileSync(file, JSON.stringify({ stage: st, seed: SEED, skins: hashes }, null, 1));
    console.log(`saved ${n} ${st} skin hashes -> ${path.basename(file)}`);
    continue;
  }
  if (!fs.existsSync(file)) {
    console.error(`no baseline at ${file} — run with --save first`);
    failed = true;
    continue;
  }
  const base = JSON.parse(fs.readFileSync(file, "utf8"));
  const prev = base.skins || {};
  const drift = [];
  for (const id of Object.keys(prev)) {
    if (!(id in hashes)) { drift.push(`${id}: MISSING (skin gone or stage changed)`); continue; }
    if (hashes[id].hash !== prev[id].hash) {
      drift.push(`${id}: ${prev[id].hash} -> ${hashes[id].hash}  (${prev[id].bytes} -> ${hashes[id].bytes} bytes)`);
    }
  }
  for (const id of Object.keys(hashes)) if (!(id in prev)) drift.push(`${id}: NEW`);

  if (drift.length) {
    console.error(`\n${st}: ${drift.length} of ${n} composition(s) DRIFTED`);
    for (const d of drift.slice(0, 40)) console.error(`  ${d}`);
    if (drift.length > 40) console.error(`  ... and ${drift.length - 40} more`);
    failed = true;
  } else {
    console.log(`${st}: ${n} composition(s) byte-identical to baseline`);
  }
}

process.exit(failed ? 1 : 0);
