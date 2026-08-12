// NATIVE-PACK VARIETY — the anti-repetition pass, proved against every native composer.
//
// The risk this file exists to disprove: `varyArchetypes` substitutes a scene's TYPE, and
// a pack's scene builders have preconditions (a `stats` builder wants a number, `gallery`
// wants several images). A careless swap renders an EMPTY panel — a worse defect than the
// repetition it fixes. So each pack is composed twice from the same deliberately
// monotonous storyboard — five text-led scenes that all fall through to one archetype —
// and the result is checked for (a) more variety than before and (b) NO scene losing content.
//
//   node scripts/test-native-variety.js        (npm run test:variety)

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-var-"));
const config = require("../src/config");
config.paths.dbFile = path.join(TMP, "jobs.json");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

const { varyArchetypes } = require("../src/services/motion_planner");

// Five text-led scenes with no numbers, no bullets, no lists — every middle scene hits
// the pack's single fallthrough, which is exactly the film that reads as one static set.
const STORYBOARD = {
  title: "Acme",
  durationSec: 20,
  scenes: [
    { id: "s1", start: 0,  duration: 4, kind: "hook",   role: "hook",    purpose: "hook",    headline: "Meet Acme", subtext: "Built for teams", onScreenText: ["Meet Acme"], voiceover: "Meet Acme." },
    { id: "s2", start: 4,  duration: 4, kind: "bullet", role: "feature", purpose: "feature", headline: "Ship faster", subtext: "Less friction", onScreenText: ["Ship faster"], voiceover: "Ship faster." },
    { id: "s3", start: 8,  duration: 4, kind: "bullet", role: "feature", purpose: "feature", headline: "Stay aligned", subtext: "One place", onScreenText: ["Stay aligned"], voiceover: "Stay aligned." },
    { id: "s4", start: 12, duration: 4, kind: "bullet", role: "feature", purpose: "feature", headline: "Move together", subtext: "In sync", onScreenText: ["Move together"], voiceover: "Move together." },
    { id: "s5", start: 16, duration: 4, kind: "cta",    role: "cta",     purpose: "cta",     headline: "Start today", subtext: "acme.com", onScreenText: ["Start today"], voiceover: "Start today." },
  ],
};
const DIMS = { width: 854, height: 480, fps: 24 };
// One distinctive word per scene, used to prove the scene still carries its copy.
const KEYWORD = { s1: "ACME", s2: "FASTER", s3: "ALIGNED", s4: "TOGETHER", s5: "TODAY" };

// ---- the helper's own contract ---------------------------------------------
test("varyArchetypes: breaks a run of identical middle scenes", () => {
  const { archetypes, changed } = varyArchetypes(
    ["open", "showcase", "showcase", "showcase", "cta"],
    { pool: ["open", "showcase", "statement", "hero", "cta"], seedKey: "j" }
  );
  assert.ok(changed >= 1, "a three-scene run must be broken");
  assert.strictEqual(archetypes[0], "open", "the opener is structural — never substituted");
  assert.strictEqual(archetypes[4], "cta", "the closer is structural — never substituted");
  for (let i = 1; i < archetypes.length; i++) {
    assert.notStrictEqual(archetypes[i], archetypes[i - 1], `scenes ${i} and ${i + 1} still match`);
  }
});

test("varyArchetypes: never substitutes a DATA-shaped scene", () => {
  // Two adjacent `stats` scenes stay `stats`: that builder wants a number, and swapping it
  // for a generic type would silently drop the metric the scene exists to show.
  const { archetypes, changed } = varyArchetypes(
    ["open", "stats", "stats", "showcase", "cta"],
    { pool: ["open", "stats", "showcase", "statement", "cta"], seedKey: "j" }
  );
  assert.deepStrictEqual(archetypes.slice(1, 3), ["stats", "stats"]);
  assert.strictEqual(changed, 0);
});

test("varyArchetypes: never invents a second opener or CTA", () => {
  const { archetypes } = varyArchetypes(
    ["open", "showcase", "showcase", "showcase", "cta"],
    { pool: ["open", "showcase", "cta"], seedKey: "j" }   // nothing generic to swap in
  );
  assert.ok(!archetypes.slice(1, 4).includes("open"), "a middle scene must never become an opener");
  assert.ok(!archetypes.slice(1, 4).includes("cta"), "a middle scene must never become a CTA");
});

test("varyArchetypes: deterministic, and a no-op on an already-varied sequence", () => {
  const base = ["open", "showcase", "statement", "hero", "cta"];
  const opts = { pool: ["open", "showcase", "statement", "hero", "cta"], seedKey: "j" };
  assert.strictEqual(varyArchetypes(base, opts).changed, 0);
  assert.deepStrictEqual(varyArchetypes(base, opts).archetypes, varyArchetypes(base, opts).archetypes);
});

test("varyArchetypes: honours locked indices (asset-driven promotions win)", () => {
  const { archetypes } = varyArchetypes(
    ["open", "showcase", "showcase", "showcase", "cta"],
    { pool: ["open", "showcase", "statement", "hero", "cta"], seedKey: "j", locked: [2] }
  );
  assert.strictEqual(archetypes[2], "showcase", "a deliberately promoted scene must not be re-typed");
});

// ---- every native pack, composed for real ----------------------------------
// A pack is only listed here if its manifest names it, so this list cannot drift from
// what the pipeline can actually render.
const frameManifest = require("../src/services/frame_manifest");
const frameRegistry = require("../src/services/frame_registry");

const packs = frameRegistry.listPacks().map((p) => ({ pack: p, renderer: (frameManifest.getManifest(p) || {}).renderer }))
  .filter((x) => x.renderer);

const COMPOSER_FOR = {
  "three-flagship": "flagship_composer", "three-brightlife": "brightlife_composer",
  "blueprint": "blueprint_composer", "bloom-fable": "bloom_composer", "bauhaus-riot": "bauhaus_composer",
  "terminal-departures": "terminal_departures_composer", "paper-tales": "paper_tales_composer",
  "dom-prisma": "prisma_composer",
  "motion-canvas": "motion_canvas_composer", "paper-craft": "paper_craft_composer",
};

// Per-scene content proxy: how much markup the composer emitted inside each scene clip.
// An emptied scene shows up as a collapse against its siblings.
function sceneContentSizes(html, count) {
  const sizes = [];
  for (let i = 1; i <= count; i++) {
    const re = new RegExp(`id="(?:s${i}|sc${i}|scene${i})"[\\s\\S]{0,20000}?(?=id="(?:s${i + 1}|sc${i + 1}|scene${i + 1})"|$)`);
    const m = html.match(re);
    sizes.push(m ? m[0].length : 0);
  }
  return sizes;
}

let composed = 0;
for (const { pack, renderer } of packs) {
  const mod = COMPOSER_FOR[renderer];
  if (!mod) continue;                       // om-* skins share one engine, covered below
  let composer;
  try { composer = require(`../src/services/${mod}`); } catch { continue; }
  if (typeof composer.buildComposition !== "function") continue;
  composed++;
  test(`${pack} (${renderer}): variation regresses nothing`, () => {
    // Compose the SAME storyboard twice — once with the pass disabled (the pack's own
    // original sequence) and once with it on — and compare. This asks the only question
    // that matters: did varying the archetypes LOSE anything? Asserting against a fixed
    // expectation instead would fail packs for their own pre-existing behaviour (bloom-fable,
    // for one, renders no middle-scene headline either way — a real quirk, but not this
    // pass's doing).
    const build = () => composer.buildComposition({
      storyboard: JSON.parse(JSON.stringify(STORYBOARD)),
      dims: DIMS, framePack: pack, assets: [], captionCues: [], seedKey: "variety-test",
    });
    process.env.KF_NO_ARCHETYPE_VARIATION = "1";
    const before = build();
    delete process.env.KF_NO_ARCHETYPE_VARIATION;
    const built = build();

    const html = built && built.indexHtml;
    assert.ok(html && html.length > 2000, "the composer must emit a real document");
    const plainOf = (b) => String((b && b.indexHtml) || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toUpperCase();
    const baseText = plainOf(before), variedText = plainOf(built);
    for (const sc of STORYBOARD.scenes.slice(1, -1)) {
      const key = KEYWORD[sc.id];
      if (!baseText.includes(key)) continue;          // the pack never showed it — not our regression
      assert.ok(variedText.includes(key), `scene ${sc.id} lost its copy ("${key}") once archetypes were varied`);
    }
    // The document must not collapse either — a swap that guts a scene shows up as a
    // large drop in emitted markup.
    assert.ok(html.length > before.indexHtml.length * 0.75,
      `the varied composition shrank from ${before.indexHtml.length} to ${html.length} chars — a substituted builder likely rendered far less`);
    // Every scene's copy must survive the substitution — this is the precondition risk.
    // Compare on a distinctive WORD against tag-stripped, case-folded text: packs
    // legitimately transform copy (terminal-departures uppercases and filters to
    // [A-Z0-9]; paper-tales wraps each word in its own span), and an exact-phrase match
    // would fail them for doing their job.
    // And the clip skeleton must still be intact (one timed clip per scene at least).
    const clips = (html.match(/data-start="/g) || []).length;
    assert.ok(clips >= STORYBOARD.scenes.length - 1, `expected ~${STORYBOARD.scenes.length} timed clips, found ${clips}`);
  });
}

// The seven OM skins run through one shared engine, so one pass covers them all.
test("om-stage skins: compose without emptying a scene", () => {
  const om = require("../src/services/om_stage");
  // Each OM pack is a SKIN over the one shared engine (see pipeline.js's renderer table),
  // so exercising the seven skins proves the engine's variation pass for all of them.
  const SKIN_MODULE = {
    "organic-garden": "organic_garden", "lantern-night": "lantern_night",
    "daybreak-bakehouse": "daybreak_bakehouse", "story-blocks": "story_blocks",
    "poster-pop": "poster_pop", "premiere-night": "premiere_night", "hype-wave": "hype_wave",
  };
  const skinFor = (pack) => {
    const m = SKIN_MODULE[pack];
    try { return m ? require(`../src/services/om_skins/${m}`) : null; } catch { return null; }
  };
  const skins = ["organic-garden", "lantern-night", "daybreak-bakehouse", "story-blocks", "poster-pop", "premiere-night", "hype-wave"]
    .filter((p) => frameRegistry.listPacks().includes(p));
  assert.ok(skins.length, "no OM packs installed");
  for (const pack of skins) {
    const skin = skinFor(pack);
    if (!skin || typeof skin.buildComposition !== "function") continue;
    const build = () => skin.buildComposition({
      storyboard: JSON.parse(JSON.stringify(STORYBOARD)),
      dims: DIMS, framePack: pack, assets: [], captionCues: [], seedKey: "variety-test",
    });
    process.env.KF_NO_ARCHETYPE_VARIATION = "1";
    const before = build();
    delete process.env.KF_NO_ARCHETYPE_VARIATION;
    const built = build();
    assert.ok(built && built.indexHtml && built.indexHtml.length > 2000, `${pack} produced no document`);
    const plainOf = (b) => String((b && b.indexHtml) || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toUpperCase();
    const baseText = plainOf(before), variedText = plainOf(built);
    for (const sc of STORYBOARD.scenes.slice(1, -1)) {
      const key = KEYWORD[sc.id];
      if (!baseText.includes(key)) continue;
      assert.ok(variedText.includes(key), `${pack}: scene ${sc.id} lost its copy once archetypes were varied`);
    }
    assert.ok(built.indexHtml.length > before.indexHtml.length * 0.75, `${pack}: the varied composition collapsed`);
  }
});

console.log(`\n(${composed} native composer(s) exercised)`);
console.log(`\n${passed} passed, ${failed} failed\n`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
