// PACK-COMPOSER GUARD — a pack with a design of its own must have a composer.
//
// WHY THIS EXISTS. `kinetic-bold` shipped with no `renderer` key. `composerModuleFor` returned
// nothing, so every film that selected it rendered through the GENERIC scene kit wearing its palette
// — while its manifest described a pack that did not exist in code:
//
//   "Type IS the visual: enormous Anton words fill the frame, scenes hard-cut between near-black and
//    off-white grounds, and each scene carries exactly one electric accent."
//
// NOTHING COULD HAVE CAUGHT IT, and that is the point worth keeping. Every other guard in this
// directory enumerates the packs that HAVE a dedicated composer and checks those — the goldens, the
// ghost check, dead tweens, dropped CSS, shot containment, all of them. A pack with no composer is
// not a failing row in those reports; it is an ABSENT row. It was invisible to the whole suite by
// construction, and stayed that way until someone went looking for it by name.
//
// HOW IT DETECTS. Walk every pack in the registry. A pack must either resolve to a composer, or be
// listed in KIT_RENDERED below with a reason. There is no third state.
//
// Run: npm run test:pack-composers

const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");

// DELIBERATELY KIT-RENDERED. Keep the reason with the entry: a pack listed here is claiming that the
// generic scene kit IS its intended look, not that its composer is missing. An entry without a
// reason is how kinetic-bold would have hidden here instead.
const KIT_RENDERED = {
  // (empty — every pack in the library currently has, and should have, its own composer)
};

function main() {
  const packs = frameRegistry.listPacks();
  console.log(`\nPACK-COMPOSER GUARD — ${packs.length} pack(s) in the registry\n`);

  const missing = [];
  let withComposer = 0, kit = 0;

  for (const pack of packs) {
    const manifest = fm.getManifest(pack) || {};
    const renderer = manifest.renderer;
    if (renderer && composerModuleFor(renderer)) { withComposer++; continue; }
    if (Object.prototype.hasOwnProperty.call(KIT_RENDERED, pack)) { kit++; continue; }
    missing.push({ pack, renderer: renderer || "(none)", vibe: String(manifest.vibe || "").slice(0, 96) });
  }

  console.log(`  ${withComposer} pack(s) resolve to a dedicated composer`);
  if (kit) console.log(`  ${kit} pack(s) deliberately kit-rendered`);
  for (const m of missing) {
    console.log(`  ✗ ${m.pack}: renderer ${m.renderer} resolves to NO composer — renders as the generic kit`);
    if (m.vibe) console.log(`      its manifest asks for: "${m.vibe}…"`);
  }

  console.log(`\n${packs.length - missing.length} passed, ${missing.length} failed  (${packs.length} pack(s) checked)`);
  process.exit(missing.length ? 1 : 0);
}

if (require.main === module) main();
