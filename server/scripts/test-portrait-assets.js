// Regression guard: EVERY portrait (9:16) template must richly + context-appropriately
// render collected assets — no generic text-only slideshow when screenshots/images/logos
// were collected.
//
// Auto-discovers every installed pack whose manifest orientation is "portrait", resolves
// its dedicated composer by convention (renderer "a-b" -> "a_b_composer.js"), and builds it
// against TWO realistic post-CD/VLD scenarios:
//   • FEATURE deck (hook / feature / feature / stat / cta)
//   • ADVERSARIAL deck (hook / STAT / QUOTE / BULLET / cta) — the case that maps entirely to
//     stat/quote/bullet archetypes and previously left them text-only (the P0).
// For EACH deck it asserts (via services/asset_render_check):
//   • renderStatus is not a FAIL_* (never text-only / no-<img> / broken paths)
//   • shotsRendered >= MIN_SHOTS distinct screenshots/images
//   • scenesWithAsset >= MIN_SCENES — assets are SPREAD across content scenes, not crammed
//     onto one showcase scene while stat/quote/bullet scenes render synthetic graphics
//   • the logo is shown; assigned assets are (mostly) rendered (missingAssignments small)
//
// A new portrait template cannot pass CI unless it supports dynamic screenshots, images,
// logos, user-uploads and website assets AND places them across its content scenes.
// Run: node scripts/test-portrait-assets.js   (exits non-zero on any failure).

const path = require("node:path");
const fs = require("node:fs");
const frameManifest = require("../src/services/frame_manifest");
const frameRegistry = require("../src/services/frame_registry");
const { auditAssetRender } = require("../src/services/asset_render_check");

const MIN_SHOTS = 2;          // at least 2 of the 3 non-logo shots must render
const MIN_SCENES = 3;         // assets must reach at least 3 scenes (spread, not concentrated)
const MAX_MISSING = 1;        // at most 1 CD-assigned asset may go unrendered

// Realistic assets AS DELIVERED to buildComposition after the Creative Director + Visual
// Layout Director: a hero website screenshot, a support upload, a harvested brand image, and
// a logo. Each is owner/trusted so a correct composer shows them; assigned to s2/s3/s4.
const ASSETS = [
  { path: "assets/s0.png", type: "image", ratio: 0.667, width: 800, height: 1200, source: "website", kindHint: "screenshot", cdProminence: "hero", visionOk: true, cdScore: 0.92, sceneId: "s2", alt: "product screenshot" },
  { path: "assets/s1.png", type: "image", ratio: 1.78, width: 1600, height: 900, source: "upload", kindHint: "screenshot", cdProminence: "support", cdScore: 0.85, sceneId: "s3", alt: "dashboard" },
  { path: "assets/s2.png", type: "image", ratio: 1.4, width: 1400, height: 1000, source: "website-asset", kindHint: "photo", cdProminence: "support", visionOk: true, cdScore: 0.7, sceneId: "s4", alt: "brand image" },
  { path: "assets/logo.png", type: "image", width: 400, height: 400, source: "website-brand", role: "logo", alt: "logo" },
];
const STORYBOARDS = [
  ["feature", { title: "Acme", durationSec: 16, scenes: [
    { id: "s1", start: 0, duration: 3, kind: "hook", purpose: "intro", headline: "Ship faster with Acme", subtext: "The developer cloud." },
    { id: "s2", start: 3, duration: 3.5, kind: "feature", purpose: "feature", headline: "One dashboard for everything", onScreenText: ["Deploys", "Metrics", "Logs"] },
    { id: "s3", start: 6.5, duration: 3.5, kind: "feature", purpose: "proof", headline: "Trusted by 40,000 teams", onScreenText: ["99.99% uptime"] },
    { id: "s4", start: 10, duration: 3, kind: "stat", purpose: "result", headline: "Deploy in 8 seconds", emphasis: "8s" },
    { id: "s5", start: 13, duration: 3, kind: "cta", purpose: "cta", headline: "Acme Cloud", emphasis: "Start free", subtext: "acme.dev" }] }],
  ["adversarial", { title: "Acme", durationSec: 15, scenes: [
    { id: "s1", start: 0, duration: 3, kind: "hook", purpose: "intro", headline: "Meet Acme" },
    { id: "s2", start: 3, duration: 3, kind: "stat", purpose: "proof", headline: "40,000 teams trust us", emphasis: "40k", onScreenText: ["99.99% uptime"] },
    { id: "s3", start: 6, duration: 3, kind: "quote", purpose: "testimonial", headline: "The best tool we use", subtext: "CTO, Acme" },
    { id: "s4", start: 9, duration: 3, kind: "bullet", purpose: "list", headline: "Why teams pick us", onScreenText: ["Fast", "Secure", "Simple"] },
    { id: "s5", start: 12, duration: 3, kind: "cta", purpose: "cta", headline: "Acme", emphasis: "Start free" }] }],
];
const DIMS = { width: 1080, height: 1920, fps: 30 };

// Resolve through the pipeline's OWN dispatch table, never by guessing a filename from
// the renderer id. The old `renderer.replace(/-/g,"_") + "_composer.js"` guess missed
// every pack whose module isn't named that way (the seven OM skins live in om_skins/,
// prisma-bloc's renderer is "dom-prisma" but its module is prisma_composer.js) and the
// miss was reported as "no dedicated composer — routes to scene-kit", which is simply
// false: they all route to dedicated composers. 8 of 22 portrait packs were therefore
// never asserted by the guard that exists to assert them. See pipeline.DEDICATED_COMPOSERS.
const { composerModuleFor } = require("../src/services/pipeline");

let pass = 0, fail = 0, skipped = 0;
const fails = [];

const portraitPacks = frameRegistry.listPacks().filter((name) => {
  try { const m = frameManifest.getManifest(name); return m && m.orientation === "portrait"; }
  catch { return false; }
});

console.log(`Portrait packs discovered: ${portraitPacks.length}   (assert per deck: shots>=${MIN_SHOTS}, scenes>=${MIN_SCENES}, logo, missing<=${MAX_MISSING})\n`);
console.log("template".padEnd(20) + "feature(scenes/shots)   adversarial(scenes/shots)   verdict");

for (const pack of portraitPacks) {
  const m = frameManifest.getManifest(pack);
  const renderer = (m && m.renderer) || pack;
  const comp = composerModuleFor(renderer);
  // A portrait pack with NO dedicated composer legitimately routes to the scene-kit, which
  // has its own coverage. That is a real skip. A pack whose module simply could not be
  // resolved is NOT — that used to be silent, and it hid 8 packs.
  if (!comp) { skipped++; console.log(pack.padEnd(20) + `SKIP (renderer "${renderer}" has no dedicated composer — routes to scene-kit)`); continue; }
  try {
    let ok = true; const cells = [];
    for (const [, sb] of STORYBOARDS) {
      const built = comp.buildComposition({ storyboard: sb, dims: DIMS, framePack: pack, captionCues: [], assets: ASSETS, brandSkin: null });
      const rep = auditAssetRender({ indexHtml: built.indexHtml, assets: ASSETS });
      const deckOk = !/^FAIL_/.test(rep.renderStatus) && rep.shotsRendered >= MIN_SHOTS && rep.scenesWithAsset >= MIN_SCENES && rep.logoRendered === true && rep.missingAssignments <= MAX_MISSING;
      if (!deckOk) { ok = false; fails.push({ pack, rep }); }
      cells.push(`${rep.scenesWithAsset}/${rep.sceneCount}·${rep.shotsRendered}shots`);
    }
    if (ok) pass++; else fail++;
    console.log((ok ? "OK  " : "FAIL ") + pack.padEnd(ok ? 16 : 15) + cells[0].padEnd(24) + cells[1].padEnd(28) + (ok ? "pass" : "FAIL"));
  } catch (e) {
    fail++; fails.push({ pack, error: e.message });
    console.log("ERR  " + pack.padEnd(15) + " " + e.message.split("\n")[0]);
  }
}

console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped (of ${portraitPacks.length} portrait packs)`);
if (fail) {
  console.log("\nFAILURES — these portrait templates do not richly render collected assets:");
  for (const f of fails) console.log("  " + f.pack + ": " + (f.error || JSON.stringify(f.rep)));
}
process.exit(fail === 0 ? 0 : 1);
