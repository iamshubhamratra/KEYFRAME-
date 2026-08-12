// QUALITY CENSUS — how empty is every pack, right now?
//
// The problem this exists to solve: "video quality is getting worse" was only
// ever observable by watching films. Every structural gate stayed green while
// scenes shipped as a title band over bare ground, because those gates measure
// INTENT (was media requested, was a clip emitted) and never the RESULT.
//
// This measures the result, for every pack, from the previews already on disk —
// so it costs no renders and can run any time. It turns a feeling into a table:
// which packs are sparse, and by how much.
//
//   node scripts/audit-density.js               # all packs
//   node scripts/audit-density.js --json        # machine-readable
//   node scripts/audit-density.js --save        # write the baseline
//   node scripts/audit-density.js --check       # fail if a pack got emptier
//
// --save/--check is the regression protection: a pack that silently rots shows
// up as a diff against its own recorded baseline instead of as a user complaint
// weeks later.

const fs = require("node:fs");
const path = require("node:path");
const { scanFilm } = require("../src/services/frame_density");

const FRAMES = path.join(__dirname, "..", "public", "frames");
const BASELINE = path.join(__dirname, "..", "framecheck", "density-baseline.json");
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const save = args.includes("--save");
const check = args.includes("--check");
// A pack may legitimately get a little sparser through a redesign; this is the
// margin before a change is treated as rot rather than noise.
const SLIP = 0.05;

function packs() {
  return fs.readdirSync(FRAMES)
    .filter((d) => fs.existsSync(path.join(FRAMES, d, "preview.mp4")))
    .sort();
}

(async () => {
  const list = packs();
  const rows = [];
  for (const p of list) {
    const mp4 = path.join(FRAMES, p, "preview.mp4");
    let portrait = true;
    try {
      const pack = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "frames", p, "pack.json"), "utf8"));
      portrait = !!pack.portraitNative;
    } catch { /* orientation is a hint for the sample grid, not correctness */ }
    let res = null;
    try { res = await scanFilm(mp4, { durationSec: 30, portrait }); }
    catch (e) { rows.push({ pack: p, error: String(e.message).slice(0, 60) }); continue; }
    if (!res || !res.frames.length) { rows.push({ pack: p, error: "no frames" }); continue; }

    const ink = res.frames.map((f) => f.inkRatio);
    const worst = res.frames.reduce((a, b) => (b.inkRatio < a.inkRatio ? b : a));
    const maxDead = Math.max(...res.frames.map((f) => f.deadBand));
    rows.push({
      pack: p,
      meanInk: Math.round((ink.reduce((a, b) => a + b, 0) / ink.length) * 1000) / 1000,
      minInk: Math.round(worst.inkRatio * 1000) / 1000,
      maxDead: Math.round(maxDead * 1000) / 1000,
      sparse: res.findings.length,
      worstAt: worst.t,
    });
  }

  const ok = rows.filter((r) => !r.error);
  if (asJson) { console.log(JSON.stringify(rows, null, 2)); }
  else {
    // Worst first — the point of the table is what to fix, not an alphabet.
    const sorted = [...ok].sort((a, b) => (b.sparse - a.sparse) || (a.minInk - b.minInk));
    console.log("pack".padEnd(24) + "mean".padEnd(8) + "min".padEnd(8) + "dead".padEnd(8) + "sparse");
    console.log("-".repeat(56));
    for (const r of sorted.slice(0, 24)) {
      const flag = r.sparse ? "  <-- " + r.sparse + " sparse scene(s)" : "";
      console.log(r.pack.padEnd(24)
        + `${Math.round(r.meanInk * 100)}%`.padEnd(8)
        + `${Math.round(r.minInk * 100)}%`.padEnd(8)
        + `${Math.round(r.maxDead * 100)}%`.padEnd(8)
        + (r.sparse || "") + flag);
    }
    const flagged = ok.filter((r) => r.sparse);
    const errs = rows.filter((r) => r.error);
    console.log("-".repeat(56));
    console.log(`${ok.length} pack(s) measured, ${flagged.length} with sparse scene(s)${errs.length ? `, ${errs.length} unreadable` : ""}`);
    const mean = ok.reduce((a, r) => a + r.meanInk, 0) / (ok.length || 1);
    console.log(`fleet mean ink coverage: ${Math.round(mean * 100)}%`);
  }

  if (save) {
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    const base = {};
    for (const r of ok) base[r.pack] = { meanInk: r.meanInk, minInk: r.minInk, maxDead: r.maxDead };
    fs.writeFileSync(BASELINE, JSON.stringify(base, null, 2), "utf8");
    console.log(`baseline written: ${BASELINE} (${Object.keys(base).length} packs)`);
  }

  if (check) {
    if (!fs.existsSync(BASELINE)) { console.error("no baseline — run with --save first"); process.exit(2); }
    const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
    const rot = [];
    for (const r of ok) {
      const b = base[r.pack];
      if (!b) continue;                                   // a new pack is not a regression
      if (r.meanInk < b.meanInk - SLIP) rot.push(`${r.pack}: mean ink ${Math.round(b.meanInk * 100)}% -> ${Math.round(r.meanInk * 100)}%`);
      if (r.maxDead > b.maxDead + SLIP) rot.push(`${r.pack}: dead band ${Math.round(b.maxDead * 100)}% -> ${Math.round(r.maxDead * 100)}%`);
    }
    if (rot.length) {
      console.error(`\nDENSITY REGRESSION in ${rot.length} pack(s):`);
      for (const x of rot) console.error(`  ${x}`);
      process.exit(1);
    }
    console.log("no density regression against baseline");
  }
})();
