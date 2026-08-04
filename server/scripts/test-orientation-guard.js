// Regression guard: a pack authored for one aspect must never silently lay out another.
//
// A portrait composer positions vertically as a fraction of HEIGHT and sizes every height as
// a fraction of WIDTH (cqw — the only definite unit inside an auto-height parent). Those two
// are calibrated against each other at the authored 1080x1920 and nowhere else: render the
// same markup at 1920x1080 and heights inflate while the room for them contracts. Measured
// on organic-garden, the hook's device frame ends 99.2cqw deep in a 56.3cqw-tall frame — a
// 76% overflow. 22 packs declared `orientation` in pack.json while the key sat outside the
// manifest schema and nothing in the selection path read it, so nothing prevented that pair.
//
// The law (identical to the localization reroute it sits beside): an auto/brief pick is
// CORRECTED silently; an explicit user pick is HONORED and disclosed.
// Run: node scripts/test-orientation-guard.js   (exits non-zero on any failure).

const { __test } = require("../src/agents/graph");
const fm = require("../src/services/frame_manifest");

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log("  ok   " + name); } else { fail++; console.log("  FAIL " + name); } };

// A portrait-authored pack and an aspect-agnostic one, discovered rather than hardcoded, so
// the test keeps working as packs come and go.
const packs = require("../src/services/frame_registry").listPacks();
const portraitPack = packs.find((p) => fm.packOrientation(p) === "portrait");
const agnosticPack = packs.find((p) => fm.packOrientation(p) === null);

const job = (orientation, framePack) => ({
  id: "orientation-guard-test", orientation, duration: 12,
  intent: { preferences: { framePack } },
});

(async () => {
  if (!portraitPack || !agnosticPack) {
    console.log(`SKIP — need one portrait pack and one aspect-agnostic pack installed (found ${portraitPack}/${agnosticPack})`);
    process.exit(0);
  }
  console.log(`portrait pack: ${portraitPack} · aspect-agnostic pack: ${agnosticPack}\n`);

  console.log("-- packFitsOrientation --");
  t("portrait pack fits a vertical job", fm.packFitsOrientation(portraitPack, "vertical") === true);
  t("portrait pack REJECTS a horizontal job", fm.packFitsOrientation(portraitPack, "horizontal") === false);
  t("square is served by either authored aspect", fm.packFitsOrientation(portraitPack, "square") === true);
  t("aspect-agnostic pack fits horizontal", fm.packFitsOrientation(agnosticPack, "horizontal") === true);
  t("aspect-agnostic pack fits vertical", fm.packFitsOrientation(agnosticPack, "vertical") === true);
  t("orientation survives the manifest schema", fm.getManifest(portraitPack).orientation === "portrait");
  t("unknown pack never blocks (fail-open)", fm.packFitsOrientation("no-such-pack-xyz", "horizontal") === true);

  console.log("\n-- frameSelectorAgent routing --");
  let r = await __test.frameSelectorAgent({ job: job("horizontal", "auto"), brief: { suggestedFramePack: portraitPack } });
  t("auto: a portrait brief pick is rerouted off portrait on 16:9", fm.packFitsOrientation(r.framePack, "horizontal"));
  t("auto: the correction is silent — nothing to disclose", !r.orientationPackWarning);

  r = await __test.frameSelectorAgent({ job: job("horizontal", portraitPack), brief: {} });
  t("explicit: the user's portrait pick is HONORED on 16:9", r.framePack === portraitPack);
  t("explicit: the layout gap is disclosed", !!r.orientationPackWarning && /designed for portrait/.test(r.orientationPackWarning));

  r = await __test.frameSelectorAgent({ job: job("vertical", portraitPack), brief: {} });
  t("vertical: a portrait pick is left alone", r.framePack === portraitPack);
  t("vertical: nothing disclosed", !r.orientationPackWarning);

  r = await __test.frameSelectorAgent({ job: job("vertical", "auto"), brief: { suggestedFramePack: agnosticPack } });
  t("vertical auto: whatever is chosen fits the job", fm.packFitsOrientation(r.framePack, "vertical"));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
