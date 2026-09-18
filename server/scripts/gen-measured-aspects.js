// REGENERATE services/template_media.js MEASURED_ASPECTS FROM A MEASUREMENT RUN.
//
//   npm run audit:slotfit:long                       # measure
//   node scripts/gen-measured-aspects.js --measured scripts/slot-fit-out   # write
//
// 197 packs render a bundled template this repo does not author, and 50 more are long-form
// FilmKit skins whose geometry lives in generated files. Neither can publish a
// `mediaGeometry`, so the crop engine has nothing to analyse against and falls back to a
// hardcoded guess — three ratios those films never draw.
//
// MEASURED_ASPECTS closes that gap with the shapes those renderers were actually observed
// to paint. Because it is a snapshot of the templates, it goes stale the moment one of them
// is reshaped — which is exactly what happened to `showcase` between two runs of this
// audit. So regenerating is a command, not a note in a doc.
//
// Renderers that DO declare geometry are skipped: their own declaration is better than any
// measurement of it, and it carries the flex bands a measurement cannot see.

const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const CHECK = argv.includes("--check");

const MEASURED = path.resolve(opt("--measured", path.join(__dirname, "slot-fit-out")));
const TARGET = path.join(__dirname, "..", "src", "services", "template_media.js");
const jsonPath = path.join(MEASURED, "slot-fit.json");
if (!fs.existsSync(jsonPath)) {
  console.error(`no measurement at ${jsonPath} — run: npm run audit:slotfit:long`);
  process.exit(2);
}

const doc = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
// NOTE: requiring pipeline boots the whole module graph, job store included. Run this when
// no job is in flight, or a second in-process store races the running server's writes.
const { PACK_RENDERERS } = require("../src/services/pipeline");
const declares = (k) => {
  const c = PACK_RENDERERS[k] && PACK_RENDERERS[k].composer;
  return !!(c && c.FAMILY && c.FAMILY.mediaGeometry);
};

// The four most frequently painted shapes per renderer and orientation. Four because a
// film needs two or three distinct ratios and one spare covers an archetype the probe
// storyboard happened not to route; more would make the crop engine analyse shapes that
// barely occur.
const buckets = new Map();
for (const r of doc.rows || []) {
  if (!(r.boxAspect > 0.05 && r.boxAspect < 20)) continue;
  if (declares(r.renderer)) continue;
  const k = `${r.renderer}|${r.orient === "16:9" ? "land" : "port"}`;
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push(Number(r.boxAspect.toFixed(2)));
}

const out = {};
for (const [k, list] of buckets) {
  const [rend, orient] = k.split("|");
  const freq = new Map();
  for (const a of list) freq.set(a, (freq.get(a) || 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a]) => a).sort((a, b) => a - b);
  (out[rend] = out[rend] || {})[orient] = top;
}

// Every film-* skin renders through film_stage and measures identically; collapse them to
// one wildcard row rather than fifty copies of the same four numbers.
const film = Object.keys(out).filter((k) => k.startsWith("film-"));
if (film.length) {
  const first = out[film[0]];
  for (const k of film) delete out[k];
  out["film-*"] = first;
}

const body = Object.keys(out).sort().map((k) => {
  const v = out[k];
  return `  "${k}": { land: ${JSON.stringify(v.land || [])}, port: ${JSON.stringify(v.port || [])} },`;
}).join("\n");

const src = fs.readFileSync(TARGET, "utf8");
// \r? on both anchors: this repo checks out with CRLF on Windows, so `\{\n` never matches
// the opening brace (there is a \r between them) and the generator reported "could not
// find the block" on a file that plainly contains it.
const re = /(const MEASURED_ASPECTS = \{\r?\n)([\s\S]*?)(\r?\n\};)/;
if (!re.test(src)) { console.error("could not find the MEASURED_ASPECTS block in template_media.js"); process.exit(2); }
const next = src.replace(re, `$1${body}$3`);

const current = (re.exec(src) || [])[2] || "";
if (current.trim() === body.trim()) {
  console.log(`MEASURED_ASPECTS is current (${Object.keys(out).length} renderer(s), from ${path.basename(MEASURED)})`);
  process.exit(0);
}
if (CHECK) {
  console.error(`MEASURED_ASPECTS is STALE against ${path.basename(MEASURED)}. Regenerate:`);
  console.error(`  node scripts/gen-measured-aspects.js --measured ${path.relative(path.join(__dirname, ".."), MEASURED)}`);
  process.exit(1);
}
fs.writeFileSync(TARGET, next, "utf8");
console.log(`MEASURED_ASPECTS rewritten from ${path.basename(MEASURED)} — ${Object.keys(out).length} renderer(s):`);
for (const k of Object.keys(out).sort()) console.log(`   ${k.padEnd(22)} land ${JSON.stringify(out[k].land || [])}  port ${JSON.stringify(out[k].port || [])}`);
