// GUARD FOR THE MEASURING INSTRUMENT — assert that the fidelity harness reads the handoff
// library correctly, before anyone trusts a frame it produced.
//
// WHY THIS EXISTS. The whole template-fidelity programme rests on one claim, written at the top of
// scripts/shot-pack.js: "Same scene, same moment, same authored stage size, same copy — so every
// remaining difference is the DESIGN, not the content or the timing." Four defects broke that
// claim, and every one of them manufactured FALSE DEFECTS — the worst possible failure for an
// audit tool, because it sends engineers to rebuild composers that were already correct:
//
//   1. HANDOFFS pointed at `templete-design/`, which no longer exists (the library moved to
//      `old-templete/`). shot-reference.js threw on `all` while framecheck/ref/ still held the
//      pre-move captures — so the comparison looked alive and was frozen in the past.
//   2. `stats: [{v, suf, l}]` — the shape ALL TWENTY templates use — was read with
//      label|title|k|name|value, matching none of v/suf/l, so every stats entry resolved to "" and
//      the array was dropped. K.numbersIn() then found no figures, and the stats beat of every one
//      of the sixteen ported packs fell to the pictureless `statement` layout. Drive's speedometer
//      and momentum's full-bleed orange ground are implemented in the composers and were absent
//      from every frame.
//   3. Display lines under `lines` / `words` / `quote` / `text` / `stamp` / `caption` / `pill`
//      were not read, so `head` fell through to the SCENE NAME. Momentum's manifesto beat printed
//      the word "STATEMENT" where the reference sets "BUILD / BOLD. / SHIP / FASTER." — and since
//      `lines` is an array it was then scraped as the chip row, swapping headline and chips.
//   4. The asset budget defaulted to 4, below what the reference's own slot table fills, so
//      picture-hungry beats (drive's four-window Fleet) received none and fell back.
//
// Lint, goldens and the whole npm test chain were green through all four: none of them look at
// this harness. A guard that has never failed has never been tested, so each assertion below is
// calibrated against the exact defect it replaces.

const fs = require("node:fs");
const path = require("node:path");

const { resolveHandoffs } = require("./shot-reference");
const { storyboardFromRef } = require("./shot-pack");
const K = require("../src/services/om_port_kit");

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${msg}`); } };

function omScenesOf(dir, tpl) {
  const file = path.join(dir, tpl, "src", `${tpl}.dc.html`);
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, "utf8").match(/window\.OM_SCENES\s*=\s*(['`])([\s\S]*?)\1/);
  if (!m) return null;
  try { return JSON.parse(m[2]); } catch { return null; }
}

function main() {
  console.log("FRAMECHECK HARNESS GUARD — the fidelity comparison's own input\n");

  // ---- 1. The handoff library resolves (defect #1) ---------------------------------------
  let HANDOFFS;
  try { HANDOFFS = resolveHandoffs(); }
  catch (e) {
    console.log(`  ✗ handoff library unresolvable: ${e.message}`);
    console.log("\n0 passed, 1 failed");
    process.exit(1);
  }
  console.log(`handoffs: ${path.relative(path.join(__dirname, "..", ".."), HANDOFFS)}`);

  const templates = fs.readdirSync(HANDOFFS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => fs.existsSync(path.join(HANDOFFS, n, "standalone", `${n}.html`)))
    .sort();

  ok(templates.length >= 20, `expected >=20 handoff templates, found ${templates.length}`);

  // Beats that genuinely carry no display line in the reference. Enumerated, not tolerated as a
  // ratio: a NEW bare beat means either the library changed or an extractor key was lost, and both
  // deserve a failing build rather than a silent slide.
  const KNOWN_BARE = new Set(["Hacker/Compile"]);

  for (const tpl of templates) {
    const om = omScenesOf(HANDOFFS, tpl);
    if (!om) { fail++; console.log(`  ✗ ${tpl}: OM_SCENES missing or unparseable`); continue; }

    const dims = /vertical|reel|birdsong|stomp/i.test(tpl) ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
    const sb = storyboardFromRef({ template: tpl, omScenes: om }, dims);
    if (!sb) { fail++; console.log(`  ✗ ${tpl}: storyboardFromRef returned null`); continue; }

    ok(sb.scenes.length === om.length, `${tpl}: mapped ${sb.scenes.length} scenes from ${om.length}`);

    for (let i = 0; i < om.length; i++) {
      const raw = om[i];
      const sc = sb.scenes[i];
      const key = `${tpl}/${raw.name}`;

      // ---- 2. Display line is the reference's own copy, not the role label (defect #3) ------
      const bare = String(sc.headline || "").trim().toLowerCase() === String(raw.name || "").trim().toLowerCase();
      if (bare && !KNOWN_BARE.has(key)) {
        fail++;
        console.log(`  ✗ ${key}: headline is the SCENE NAME ("${sc.headline}") — a display-line key was missed. keys: ${Object.keys(raw).join(",")}`);
      } else { pass++; }

      // A headline authored as an array must not also appear as the chip row (defect #3, part 2).
      if (Array.isArray(raw.lines) && raw.lines.length) {
        const chipsAreHeadline = raw.lines.every((l) => sc.onScreenText.includes(l));
        ok(!chipsAreHeadline, `${key}: authored headline lines leaked into onScreenText as chips`);
      }

      // ---- 3. Stats reach the composer as FIGURES + LABELS (defect #2) ----------------------
      if (Array.isArray(raw.stats) && raw.stats.length >= 2) {
        const figs = K.numbersIn(sc, 3);
        ok(figs.length >= 2,
          `${key}: ${raw.stats.length} stat(s) in the reference but numbersIn() found ${figs.length} `
          + `— the stats beat will fall back to the pictureless statement layout`);
        const labels = [0, 1].map((n) => K.statLabel(sc, n)).filter(Boolean);
        ok(labels.length >= 2, `${key}: stat labels did not survive (got ${JSON.stringify(labels)})`);
      }

      // Timing must be the reference's own, or the frames are not the same moment.
      const dur = Number(raw.dur ?? raw.duration) || 4;
      ok(Math.abs(sc.duration - dur) < 0.01, `${key}: duration ${sc.duration} != reference ${dur}`);
    }
  }

  // ---- 4. The asset budget fills the reference's slot table (defect #4) --------------------
  // Read the default straight from the source so the constant and this assertion cannot drift.
  const src = fs.readFileSync(path.join(__dirname, "shot-pack.js"), "utf8");
  const m = src.match(/assets:\s*(\d+),\s*timeoutMs/);
  ok(m && Number(m[1]) >= 6,
    `shot-pack default asset budget is ${m ? m[1] : "?"} — below 6, picture-hungry beats (drive Fleet asks 6) `
    + `starve and compare our fallback against the reference's designed beat`);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

if (require.main === module) main();
