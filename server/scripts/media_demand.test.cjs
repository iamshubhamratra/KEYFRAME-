// Unit tests for media demand planning + slot coverage.
// Run: node scripts/media_demand.test.cjs   (npm run test:media)
//
// The load-bearing assertion is NO-DRIFT: for every pack, in both orientations,
// at every supply level, planMedia()'s totals must equal what scanCoverage()
// reads back out of the rendered DOM. That is what makes "one source of truth"
// enforceable rather than aspirational — if anyone re-implements slot filling in
// a composer, this test fails.
const assert = require("node:assert");
const E = require("../src/services/template_engine");
const { scanCoverage } = require("../src/services/media_fill");

const COMPOSERS = {
  "story-blocks": "storyblocks_composer", "hype-wave": "hype_composer",
  "premiere-night": "premiere_composer", "lantern-night": "lantern_composer",
  "daybreak-bakehouse": "daybreak_composer", "poster-pop": "posterpop_composer",
  "organic-garden": "organic_composer",
  "bright-minimal": "family_bright", "charged": "family_charged", "cinema": "family_cinema",
  "dark-premium": "family_darkpremium", "editorial-quiet": "family_editorial",
  "poster-loud": "family_poster", "story-handmade": "family_story", "retro-terminal": "family_terminal",
};

const KINDS = ["hook", "text", "stat", "quote", "text", "cta"];
function storyboard(n = 6) {
  const scenes = []; let t = 0;
  for (let i = 0; i < n; i++) {
    scenes.push({
      id: `s${i + 1}`, start: t, duration: 5, kind: KINDS[i % 6], purpose: KINDS[i % 6],
      headline: "A real headline here", emphasis: "real", subtext: "a supporting line",
      onScreenText: ["one two three", "four five six", "seven eight nine"],
    });
    t += 5;
  }
  return { title: "Test Film", brand: "Acme", durationSec: t, scenes };
}
const shot = (i, sceneId, portrait = false) => ({
  path: `assets/images/page_${i}.png`, type: "image", source: "website", sceneId,
  width: portrait ? 780 : 2732, height: portrait ? 1688 : 1800,
  ratio: portrait ? 780 / 1688 : 2732 / 1800, alt: "REAL website screenshot",
});
const photo = (i) => ({
  path: `assets/images/${i}.jpg`, type: "image", source: "pixabay", visionOk: true,
  width: 1920, height: 1080, ratio: 16 / 9, alt: "a photo",
});
const vector = (i) => ({
  path: `assets/images/icon_${i}.svg`, type: "image", source: "iconify", visionOk: true, alt: "an icon",
});
function supply(level) {
  if (level === 0) return [];
  if (level === 1) return [photo(1)];
  if (level === 3) return [shot(0, "s3"), photo(1), photo(2)];
  return [shot(0, "s3"), shot(1, "s2", true), photo(1), photo(2), photo(3), photo(4),
    photo(5), photo(6), vector(1), vector(2), vector(3), vector(4)];
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok  -", name); }
  catch (e) { fail++; console.log("  FAIL-", name, "\n       ", e.message); }
}

// 1. NO-DRIFT — plan totals must equal the rendered DOM, everywhere.
for (const [pack, mod] of Object.entries(COMPOSERS)) {
  const composer = require(`../src/services/${mod}`);
  for (const [label, dims] of [["landscape", { width: 1920, height: 1080, fps: 30 }],
                               ["portrait", { width: 1080, height: 1920, fps: 30 }]]) {
    for (const level of [0, 1, 3, 12]) {
      test(`no-drift: ${pack} ${label} supply=${level}`, () => {
        const opts = { storyboard: storyboard(), dims, framePack: pack, assets: supply(level), captionCues: [] };
        const planned = composer.planMedia(opts).totals;
        const dom = scanCoverage(composer.buildComposition(opts).indexHtml).totals;
        assert.equal(dom.demand, planned.demand, `demand plan=${planned.demand} dom=${dom.demand}`);
        assert.equal(dom.filled, planned.filled, `filled plan=${planned.filled} dom=${dom.filled}`);
      });
    }
  }
}

// 2. DEFECT 2 — a pinned screenshot must survive the Template Director's cast.
// Pins live outside `free`, and the cast path never consulted `pinned`, so the
// screenshot director's topic-matched page shot was silently orphaned: the film
// narrated a page it never showed.
test("cast path honors a pinned screenshot (defect 2)", () => {
  const composer = require("../src/services/storyblocks_composer");
  const pin = shot(9, "s3");
  const opts = {
    storyboard: storyboard(), dims: { width: 1920, height: 1080, fps: 30 },
    framePack: "story-blocks", captionCues: [],
    assets: [pin, photo(1), photo(2), photo(3)],
    // The director casts s3 with its OWN pick — never the pin.
    templatePlan: { byScene: { s3: { type: "feature", assets: [photo(1)], slots: {} } } },
  };
  const P = composer.planMedia(opts);
  const s3 = P.plan.find((p) => p.sceneId === "s3");
  assert.ok(s3, "s3 planned");
  assert.equal(s3.typeVia, "cast", "s3 was cast by the director");
  assert.ok(s3.media.some((a) => a && a.path === pin.path), "the pinned shot is placed in a slot");
  assert.equal(s3.slots[0].fill, "pinned", "the pin takes the primary slot");
  const html = composer.buildComposition(opts).indexHtml;
  assert.ok(html.includes(pin.path), "the pinned shot actually renders");
});

// 3. DEFECT 3 — one unmatched slot must not abandon the slots after it.
// The cast path used to `break` on the first miss. Latent for today's packs (no
// pack mixes shapes within one type yet) but load-bearing once phone slots land.
test("an unfillable slot does not abandon later slots (defect 3)", () => {
  const claimed = new Set();
  const free = [photo(1)];                       // one LANDSCAPE photo, no portrait
  const take = (pred) => { const a = free.find((x) => !claimed.has(x) && (!pred || pred(x))); if (a) claimed.add(a); return a || null; };
  const takeVec = () => null;
  const slots = E.fillSlots(["phone", "photo"], { take, takeVec });
  assert.equal(slots.length, 2, "both slots considered");
  assert.equal(slots[0].asset, null, "phone slot correctly finds no portrait asset");
  assert.ok(slots[1].asset, "the photo slot AFTER the miss is still filled");
  assert.equal(slots[1].asset.path, photo(1).path);
});

// 4. Device slots must never be filled by a non-screenshot when a screenshot exists.
test("device slot prefers a real screenshot over a stock photo", () => {
  const claimed = new Set();
  const free = [photo(1), shot(5, null)];
  const take = (pred) => { const a = free.find((x) => !claimed.has(x) && (!pred || pred(x))); if (a) claimed.add(a); return a || null; };
  const slots = E.fillSlots(["desktop"], { take, takeVec: () => null });
  assert.equal(slots[0].asset.path, shot(5, null).path, "screenshot wins the desktop slot");
  assert.equal(slots[0].fill, "screenshot");
});

// 5. Determinism — identical input, identical plan.
test("planMedia is deterministic", () => {
  const composer = require("../src/services/storyblocks_composer");
  const mk = () => ({ storyboard: storyboard(), dims: { width: 1920, height: 1080, fps: 30 },
    framePack: "story-blocks", assets: supply(12), captionCues: [] });
  const a = composer.planMedia(mk()).totals;
  const b = composer.planMedia(mk()).totals;
  assert.deepEqual(a, b);
});

// 6. Plentiful supply must leave no declared card empty.
for (const [pack, mod] of Object.entries(COMPOSERS)) {
  test(`no holes at full supply: ${pack}`, () => {
    const composer = require(`../src/services/${mod}`);
    const t = composer.planMedia({
      storyboard: storyboard(), dims: { width: 1920, height: 1080, fps: 30 },
      framePack: pack, assets: supply(12), captionCues: [],
    }).totals;
    assert.equal(t.empty, 0, `${t.empty} card(s) left empty with 12 assets available`);
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
