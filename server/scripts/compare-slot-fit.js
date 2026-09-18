// BEFORE / AFTER, ON A METRIC THAT CANNOT BE GAMED BY THE CAST.
//
//   node scripts/compare-slot-fit.js <beforeDir> <afterDir> [--csv]
//
// The obvious comparison — mean crop over every measured image — is not fair across a
// change that alters SLOT COUNTS. Reshaping a portrait wall from two letterbox tiles to
// one readable one frees an asset, the router spends it on a beat that did not exist
// before, and that new beat's rows enter the average. A composer can therefore improve
// every slot it owns and still show a worse mean, purely because the film cast differently
// (three of the thirteen fixed composers did exactly that, and said so).
//
// So the comparison here is ASSIGNMENT-INVARIANT. It asks of each SLOT SHAPE, not of each
// measured image: what would this box do to the asset classes films are actually made of?
//
//   1.518  a website capture (every one this system takes is 2732x1800)
//   1.60   a stock photograph (the modal Pixabay landscape return is 3:2-to-16:10)
//   0.667  a portrait photograph
//
// Each is run through the real fit policy (services/asset_fit.js) against the real
// measured box, and the loss is what that policy would actually discard. A slot's score is
// the mean across the three. Because it depends only on the box, a slot compares with
// itself across the two runs no matter what was cast into it.

const fs = require("node:fs");
const path = require("node:path");
const AF = require("../src/services/asset_fit");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const CSV = process.argv.includes("--csv");
if (args.length < 2) {
  console.error("usage: node scripts/compare-slot-fit.js <beforeDir> <afterDir> [--csv]");
  process.exit(2);
}

const load = (d) => {
  const p = path.resolve(d.endsWith(".json") ? d : path.join(d, "slot-fit.json"));
  if (!fs.existsSync(p)) { console.error(`no measurement at ${p}`); process.exit(2); }
  return JSON.parse(fs.readFileSync(p, "utf8"));
};

// The asset classes a real film is made of.
const PROBES = [
  { name: "capture", asset: { path: "site_0.png", source: "website", width: 2732, height: 1800, ratio: 2732 / 1800 } },
  { name: "photo", asset: { path: "p.jpg", source: "pixabay", width: 1600, height: 1000, ratio: 1.6 } },
  { name: "portrait", asset: { path: "q.jpg", source: "pixabay", width: 1000, height: 1500, ratio: 1000 / 1500 } },
];

// A FLEX SLOT MUST BE JUDGED BY ITS BAND, NOT BY ONE INSTANCE OF ITSELF.
//
// A plate that reshapes to its picture is measured at whatever shape the cast asset gave
// it — a square photo makes it square — so reading the painted box back and scoring THAT
// against a website capture measures the cast, not the slot. For any slot whose template
// declares geometry, the declaration is used instead: it carries the flex band, so each
// probe is scored against the shape that slot would actually take for it. Slots with no
// declaration (the bundled-template and long-form paths) are scored on the painted box,
// which is the only number available and is authoritative for a fixed slot anyway.
const TM = require("../src/services/template_media");
const { PACK_RENDERERS } = require("../src/services/pipeline");
const familyOf = (renderer) => {
  const R = PACK_RENDERERS[renderer];
  return (R && R.composer && R.composer.FAMILY) || null;
};
function declaredSpec(renderer, orient, type) {
  try {
    const fam = familyOf(renderer);
    if (!fam || !fam.mediaGeometry || !fam.mediaGeometry[type]) return null;
    const dims = orient === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
    const specs = TM.resolveSlots(fam, type, dims);
    return specs.find((x) => x.w > 0 && x.h > 0) || null;
  } catch { return null; }
}

// What the fit policy would LOSE on this slot: the crop it takes, or the box it leaves
// empty. Both are the same quantity — the fraction of the pairing that goes to waste.
function lossFor(slot, want) {
  let total = 0;
  for (const p of PROBES) {
    const f = AF.fitFor(p.asset, { ...slot, want: slot.want || want });
    total += Math.max(f.cropXpct, f.cropYpct, f.padXpct, f.padYpct);
  }
  return total / PROBES.length;
}

// One row per SLOT SHAPE: the largest box measured for that (renderer, orient, sceneType),
// which is the box as laid out before the camera drift scales it.
function shapes(doc) {
  const m = new Map();
  for (const r of doc.rows || []) {
    if (!(r.boxW > 2 && r.boxH > 2)) continue;
    const k = `${r.renderer}|${r.orient}|${r.sceneType || r.sceneId || "-"}`;
    const prev = m.get(k);
    if (!prev || r.boxW * r.boxH > prev.boxW * prev.boxH) {
      m.set(k, { renderer: r.renderer, orient: r.orient, type: r.sceneType || r.sceneId || "-", boxW: r.boxW, boxH: r.boxH, want: /shot|desktop/.test(String(r.wants || "")) ? "desktop" : "photo" });
    }
  }
  return m;
}

const A = shapes(load(args[0]));
const B = shapes(load(args[1]));

const rows = [];
for (const [k, b] of B) {
  const a = A.get(k);
  // The declaration wins when there is one (it carries flex); the painted box otherwise.
  const decl = declaredSpec(b.renderer, b.orient, b.type);
  const afterSlot = decl || { w: Math.round(b.boxW), h: Math.round(b.boxH), want: b.want };
  const after = lossFor(afterSlot, b.want);
  const before = a ? lossFor({ w: Math.round(a.boxW), h: Math.round(a.boxH), want: a.want }, a.want) : null;
  rows.push({
    key: k, renderer: b.renderer, orient: b.orient, type: b.type,
    beforeAspect: a ? Math.round((a.boxW / a.boxH) * 1000) / 1000 : null,
    afterAspect: decl && decl.flex
      ? `${decl.flex[0]}-${decl.flex[1]}`
      : Math.round((decl ? decl.aspect : b.boxW / b.boxH) * 1000) / 1000,
    beforeLoss: before == null ? null : Math.round(before * 10) / 10,
    afterLoss: Math.round(after * 10) / 10,
    delta: before == null ? null : Math.round((after - before) * 10) / 10,
  });
}
const gone = [...A.keys()].filter((k) => !B.has(k));

rows.sort((x, y) => (x.delta ?? 0) - (y.delta ?? 0));

if (CSV) {
  console.log("renderer,orient,sceneType,beforeAspect,afterAspect,beforeLoss,afterLoss,delta");
  for (const r of rows) console.log([r.renderer, r.orient, r.type, r.beforeAspect, r.afterAspect, r.beforeLoss, r.afterLoss, r.delta].join(","));
} else {
  console.log(`SLOT SHAPE HEALTH — mean % of a picture wasted, over a 1.518 capture, a 1.6 photo and a 0.667 portrait`);
  console.log(`${"renderer / orient / slot".padEnd(42)}${"aspect".padStart(16)}${"waste".padStart(18)}   verdict`);
  for (const r of rows) {
    const asp = r.beforeAspect == null ? `${r.afterAspect}` : `${r.beforeAspect} -> ${r.afterAspect}`;
    const loss = r.beforeLoss == null ? `${r.afterLoss}%` : `${r.beforeLoss}% -> ${r.afterLoss}%`;
    const verdict = r.delta == null ? "new slot" : r.delta <= -5 ? "BETTER" : r.delta >= 5 ? "WORSE" : "~same";
    console.log(`${(r.renderer + " " + r.orient + " " + r.type).padEnd(42)}${asp.padStart(16)}${loss.padStart(18)}   ${verdict}`);
  }
}

const paired = rows.filter((r) => r.beforeLoss != null);
const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
console.log(`\n${paired.length} slot shape(s) present in both runs`);
console.log(`  mean waste  ${mean(paired.map((r) => r.beforeLoss)).toFixed(1)}%  ->  ${mean(paired.map((r) => r.afterLoss)).toFixed(1)}%`);
console.log(`  better ${paired.filter((r) => r.delta <= -5).length} · same ${paired.filter((r) => Math.abs(r.delta) < 5).length} · worse ${paired.filter((r) => r.delta >= 5).length}`);
const badBefore = paired.filter((r) => r.beforeLoss >= 30).length;
const badAfter = paired.filter((r) => r.afterLoss >= 30).length;
console.log(`  slots wasting 30%+ of a picture:  ${badBefore}  ->  ${badAfter}`);
console.log(`  ${rows.length - paired.length} slot shape(s) only in the after run · ${gone.length} only in the before run`);
