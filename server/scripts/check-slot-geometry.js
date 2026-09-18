// SLOT GEOMETRY DRIFT CHECK — is what a template DECLARES what the browser PAINTS?
//
//   node scripts/check-slot-geometry.js [--measured DIR] [--tolerance 0.12]
//
// A composer now declares each media box's shape in `mediaGeometry`, and everything
// upstream — asset selection, the crop engine's aspect list, the fit decision, preflight's
// critical-slot gate — is computed from that declaration. A declaration that drifts from
// the CSS is therefore not a documentation bug; it silently mis-fits every picture in
// every film that pack renders.
//
// So it is checked, not trusted. `scripts/audit-slot-fit.js` measures the real painted box
// of every image in headless Chrome; this compares the declared box against it.
//
// ASPECT is what is compared, not pixels. The camera drift scales a clip by a percent or
// two between beats and the long-form skins lay out in their own coordinate space and
// scale the whole stage — both change the pixel size and neither changes the shape, which
// is the number every downstream decision actually uses.
//
// Exit 1 on drift, so this can gate a commit.

const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };

const MEASURED = path.resolve(opt("--measured", path.join(__dirname, "slot-fit-out")));
// |log(declared/measured)| — 0.12 is about a 13% difference in aspect.
const TOL = Number(opt("--tolerance", "0.12"));

const jsonPath = path.join(MEASURED, "slot-fit.json");
if (!fs.existsSync(jsonPath)) {
  console.error(`no measurement at ${jsonPath} — run: node scripts/audit-slot-fit.js --out ${path.basename(MEASURED)}`);
  process.exit(2);
}
const measured = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const { PACK_RENDERERS } = require("../src/services/pipeline");
const TM = require("../src/services/template_media");

// renderer key -> the composer's family object, for every renderer that publishes one.
const families = new Map();
for (const [key, R] of Object.entries(PACK_RENDERERS)) {
  const fam = R && R.composer && (R.composer.FAMILY || null);
  if (fam && fam.mediaGeometry) families.set(key, fam);
}

// The measured aspect of each (renderer, orient, sceneType) slot. A scene type draws its
// slots at one shape, so the median across every asset and beat is the slot's shape.
const seen = new Map();
for (const r of measured.rows || []) {
  if (!r.sceneType || !families.has(r.renderer)) continue;
  const k = `${r.renderer}|${r.orient}|${r.sceneType}`;
  if (!seen.has(k)) seen.set(k, []);
  seen.get(k).push(r.boxAspect);
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const rows = [];
for (const [key, fam] of families) {
  for (const orient of ["16:9", "9:16"]) {
    const dims = orient === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
    for (const type of Object.keys(fam.mediaSlots || {})) {
      const specs = TM.resolveSlots(fam, type, dims);
      if (!specs.length) continue;
      const m = seen.get(`${key}|${orient}|${type}`);
      if (!m || !m.length) { rows.push({ key, orient, type, declared: specs[0].aspect, measured: null, drift: null, status: "NOT MEASURED" }); continue; }
      const meas = median(m);
      // A scene's slots can legitimately differ in shape; compare against the DECLARED
      // slot whose aspect is closest, so a two-shape beat is not reported as drift.
      const best = specs.reduce((b, s) => (Math.abs(Math.log(s.aspect / meas)) < Math.abs(Math.log(b.aspect / meas)) ? s : b), specs[0]);
      // A FLEX SLOT HAS NO ONE SHAPE — that is the point of it. Its box is resolved
      // against whatever picture it received, so measuring 1.00 where the nominal
      // declaration says 1.30 is the plate correctly taking a square photo's shape, not a
      // declaration that drifted. What must hold is that the painted box stayed inside the
      // band the design said it would tolerate.
      const flex = best.flex;
      const inBand = flex ? (meas >= flex[0] * (1 - TOL) && meas <= flex[1] * (1 + TOL)) : null;
      const drift = Math.abs(Math.log(best.aspect / meas));
      rows.push({
        key, orient, type,
        declared: flex ? `${best.aspect} [${flex[0]}-${flex[1]}]` : best.aspect,
        measured: Math.round(meas * 1000) / 1000,
        drift: Math.round(drift * 1000) / 1000,
        status: flex ? (inBand ? "ok (flex)" : "OUT OF BAND") : (drift <= TOL ? "ok" : "DRIFT"),
      });
    }
  }
}

rows.sort((a, b) => (b.drift || 0) - (a.drift || 0));
const drifted = rows.filter((r) => r.status === "DRIFT" || r.status === "OUT OF BAND");
const unmeasured = rows.filter((r) => r.status === "NOT MEASURED");

console.log(`renderer / orient / scene type                declared  measured   drift  status`);
for (const r of rows) {
  console.log(`${(r.key + " " + r.orient + " " + r.type).padEnd(36)}${String(r.declared).padStart(18)}${String(r.measured ?? "-").padStart(10)}${String(r.drift ?? "-").padStart(8)}  ${r.status}`);
}
console.log(`\n${rows.length} declared slot shape(s) · ${drifted.length} drifted · ${unmeasured.length} not measured (tolerance ${TOL})`);
if (drifted.length) {
  console.log(`\nA drift means the declaration and the CSS disagree. Fix whichever is wrong — the`);
  console.log(`declaration is what every downstream decision is computed from.`);
}
process.exit(drifted.length ? 1 : 0);
