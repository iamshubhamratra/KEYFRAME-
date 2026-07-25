// Golden / characterization tests for the PURE scene->asset taxonomy surface.
//
// These two modules are the deterministic, no-model mapping layer that decides
// (a) what VISUAL TYPE an asset is  — asset_priority.categorize / assetConfidence
// (b) what INDUSTRY a film is        — asset_taxonomy.classify / profileFor / describe
// (c) what asset KIND a scene wants  — asset_taxonomy.kindForPurpose
// They are load-bearing (creative_director, graph, scene_kit, om_stage, prisma,
// visual_layout_director all consume them) yet were ENTIRELY UNTESTED — the
// existing test-asset-priority.js exercises only tierFor/rankKey/isLogo/isOwned/
// isTrustedProminent, never categorize/assetConfidence and none of asset_taxonomy.
//
// This file pins their exact current behaviour. Because every function here is
// pure (no I/O, no clock, no randomness), identical inputs => identical outputs
// is a COMPLETE behavioural spec. That makes this a byte-identical ORACLE: to
// certify any future consolidation/refactor of the taxonomy is behaviour-
// preserving, run `--dump` at HEAD, apply the change, run `--dump` again, and
// diff the two snapshots to EMPTY. (See the deferred archetypeFor dedup.)
//
// IMPORTANT: the snapshot pins whatever the CODE ON DISK does. Only ever capture
// a `--dump` golden from a CLEAN working tree (git diff HEAD == 0 for both
// modules) so it reflects committed behaviour, not an uncommitted edit.
//
// The disjoint-domain GUARD section is deliberate: classify() and categorize()
// answer different questions over disjoint input domains (film brief vs asset
// record). Feeding one the other's input yields a fail-open constant. Those
// asserts lock that separation so an accidental "merge the two CATEGORIES"
// refactor fails loudly here.
//
// Usage:  node server/scripts/test-taxonomy-golden.js [--verbose]
//         node server/scripts/test-taxonomy-golden.js --dump      (prints golden JSON)
// Exit code 1 on any failure (gates CI) — same contract as test-asset-priority.js.

const {
  categorize, assetConfidence,
} = require("../src/services/asset_priority");
const {
  classify, kindForPurpose, profileFor, describeForDirector, GENERIC,
} = require("../src/services/asset_taxonomy");

const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
const dump = process.argv.includes("--dump");
let failed = 0, passed = 0;
function check(name, fn) {
  try { fn(); passed++; if (verbose) console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${String((e && e.message) || e)}`); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || "not equal"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
function section(s) { if (!dump) console.log(`\n▐ ${s}`); }

// ---------------------------------------------------------------------------
// FIXTURES — each row is [label, input, expected]. The label doubles as the key
// in the --dump snapshot, so keep labels stable and unique within a table.
// ---------------------------------------------------------------------------

// asset_priority.categorize — visual TYPE of an asset record. Precedence:
// logo-role/assetType -> ASSET_TYPE_MAP (+screenshot->dashboard refine) -> icon
// sniff -> website/screenshot -> DATA/TEAM/PRODUCT/MARKETING/illustration -> background.
const CATEGORIZE = [
  ["null -> fail-open background", null, "background"],
  ["empty object -> fail-open background", {}, "background"],
  ["role:logo short-circuits", { role: "logo" }, "logo"],
  ["assetType:logo", { assetType: "logo" }, "logo"],
  ["map: team", { assetType: "team" }, "team"],
  ["map: marketing", { assetType: "marketing" }, "marketing"],
  ["map: illustration", { assetType: "illustration" }, "illustration"],
  ["map: icon", { assetType: "icon" }, "icon"],
  ["map: decorative", { assetType: "decorative" }, "decorative"],
  ["map: product", { assetType: "product" }, "product"],
  ["map: product-photo -> product", { assetType: "product-photo" }, "product"],
  ["map: mobile-app -> screenshot", { assetType: "mobile-app" }, "screenshot"],
  ["map: ui-design -> screenshot", { assetType: "ui-design" }, "screenshot"],
  ["map: dashboard", { assetType: "dashboard" }, "dashboard"],
  ["map: screenshot", { assetType: "screenshot" }, "screenshot"],
  ["screenshot refine -> dashboard via DATA_RE in alt", { assetType: "screenshot", alt: "quarterly kpi report" }, "dashboard"],
  ["mobile-app refine -> dashboard via DATA_RE", { assetType: "mobile-app", alt: "analytics dashboard" }, "dashboard"],
  ["map: hero -> background", { assetType: "hero" }, "background"],
  ["map: image -> background", { assetType: "image" }, "background"],
  ["icon sniff: kindHint vector", { kindHint: "vector" }, "icon"],
  ["icon sniff: source iconify", { source: "iconify" }, "icon"],
  ["icon sniff: library + /icon/ in hay", { source: "library:nimbus", alt: "app icon set" }, "icon"],
  ["library without icon-hay -> background", { source: "library:nimbus", alt: "a photo" }, "background"],
  ["website capture -> screenshot", { source: "website" }, "screenshot"],
  ["website + DATA_RE -> dashboard", { source: "website", alt: "metrics chart" }, "dashboard"],
  ["kindHint screenshot -> screenshot", { kindHint: "screenshot" }, "screenshot"],
  ["content sniff: DATA_RE -> dashboard", { alt: "quarterly kpi graph" }, "dashboard"],
  ["content sniff: TEAM_RE -> team", { alt: "our team of founders" }, "team"],
  ["content sniff: PRODUCT_RE -> product", { alt: "product mockup device" }, "product"],
  ["content sniff: MARKETING_RE -> marketing", { alt: "summer sale promo banner" }, "marketing"],
  ["content sniff: illustration -> illustration", { alt: "a colorful illustration" }, "illustration"],
  ["precedence: DATA beats TEAM (team analytics)", { alt: "team analytics" }, "dashboard"],
  // QUIRK pinned deliberately: "isometric" contains the substring "metric", so
  // DATA_RE (line 120) fires BEFORE the illustration sniff (line 124) — an
  // isometric illustration reads as "dashboard". This is current behaviour, not
  // a target; if DATA_RE is ever tightened (\bmetric\b), update this expectation.
  ["quirk: 'isometric' hits DATA_RE before illustration", { alt: "isometric flat art drawing" }, "dashboard"],
  ["unmatched content -> background", { alt: "a calm sunset" }, "background"],
];

// asset_priority.assetConfidence — 0..1, rounded 2dp. cd/clip blend with owned
// floor (0.6) / visionOk floor (0.55) / rejected-or-demoted cap (0.5); else a
// source-tier prior.
const CONFIDENCE = [
  ["null -> 0", null, 0],
  ["prior: upload tier 100", { source: "upload" }, 0.9],
  ["prior: website-brand tier 90", { source: "website-brand" }, 0.85],
  ["prior: website tier 80", { source: "website" }, 0.8],
  ["prior: website-asset tier 70", { source: "website-asset" }, 0.55],
  ["prior: library tier 60", { source: "library:x" }, 0.6],
  ["prior: iconify tier 60", { source: "iconify" }, 0.6],
  ["prior: stock tier 40", { source: "pixabay" }, 0.4],
  ["cd only, stock -> base", { cdScore: 80 }, 0.8],
  ["cd blended with clip -> mean", { cdScore: 80, clipRelevance: 0.6 }, 0.7],
  ["clip only", { clipRelevance: 0.5 }, 0.5],
  ["owned floor lifts low cd", { cdScore: 30, source: "upload" }, 0.6],
  ["owned floor no-op when cd high", { cdScore: 80, source: "upload" }, 0.8],
  ["visionOk floor lifts low cd (unowned)", { cdScore: 20, visionOk: true }, 0.55],
  ["visionOk:false caps high cd", { cdScore: 90, visionOk: false }, 0.5],
  ["__layoutDemoted caps high cd", { cdScore: 90, __layoutDemoted: true }, 0.5],
];

// asset_taxonomy.classify — INDUSTRY of a film from {subject, brief}.
const CLASSIFY = [
  ["saas", { subject: "a saas platform dashboard workflow" }, "saas"],
  ["ai", { subject: "generative ai chatbot automation neural" }, "ai"],
  ["fintech", { subject: "fintech banking payment invoice crypto" }, "fintech"],
  ["healthcare", { subject: "healthcare medical clinic patient wellness" }, "healthcare"],
  ["ecommerce", { subject: "ecommerce retail store checkout marketplace" }, "ecommerce"],
  ["education", { subject: "edtech course student teacher academy" }, "education"],
  ["technology", { subject: "hardware iot cloud infrastructure api" }, "technology"],
  ["corporate", { subject: "enterprise corporate consulting agency office" }, "corporate"],
  ["startup", { subject: "startup launch founder seed beta" }, "startup"],
  ["marketing", { subject: "advertising campaign influencer promo offer" }, "marketing"],
  ["empty -> generic", {}, "generic"],
  ["no matches -> generic", { subject: "purple zebra xylophone" }, "generic"],
  ["tie first-wins (b2b -> saas over corporate)", { subject: "b2b" }, "saas"],
  ["multi-word weight (app for teams -> saas)", { subject: "app for teams" }, "saas"],
  ["reads brief.goal", { brief: { goal: "invoice payment banking" } }, "fintech"],
  ["reads brief.keyMessages", { brief: { keyMessages: ["machine learning", "neural"] } }, "ai"],
];

// asset_taxonomy.kindForPurpose — narrative purpose -> asset KIND, "photo" default.
const KIND = [
  ["hook -> photo", "hook", "photo"],
  ["feature -> screenshot", "feature", "screenshot"],
  ["how -> screenshot", "how", "screenshot"],
  ["demo -> screenshot", "demo", "screenshot"],
  ["proof -> people", "proof", "people"],
  ["testimonial -> people", "testimonial", "people"],
  ["context -> photo", "context", "photo"],
  ["benefit -> photo", "benefit", "photo"],
  ["data -> vector", "data", "vector"],
  ["stat -> vector", "stat", "vector"],
  ["cta -> icon", "cta", "icon"],
  ["outro -> icon", "outro", "icon"],
  ["unknown -> photo default", "epilogue", "photo"],
  ["case-insensitive (HOOK -> photo)", "HOOK", "photo"],
  ["nullish -> photo default", undefined, "photo"],
];

// ---------------------------------------------------------------------------
// --dump mode: emit a stable, sorted-key golden snapshot for byte-identical certification.
// ---------------------------------------------------------------------------
if (dump) {
  const snap = {
    categorize: Object.fromEntries(CATEGORIZE.map(([k, input]) => [k, categorize(input)])),
    assetConfidence: Object.fromEntries(CONFIDENCE.map(([k, input]) => [k, assetConfidence(input)])),
    classify: Object.fromEntries(CLASSIFY.map(([k, input]) => [k, classify(input)])),
    kindForPurpose: Object.fromEntries(KIND.map(([k, input]) => [k, kindForPurpose(input)])),
    profileFor_generic_label: profileFor("generic").label,
    describeForDirector_generic: describeForDirector("generic"),
  };
  // stable key ordering so a diff of two dumps is meaningful
  const sortRepl = (_k, v) => (v && typeof v === "object" && !Array.isArray(v))
    ? Object.fromEntries(Object.keys(v).sort().map((kk) => [kk, v[kk]])) : v;
  console.log(JSON.stringify(snap, sortRepl, 2));
  process.exit(0);
}

// ---------------------------------------------------------------------------
section("asset_priority.categorize — asset visual TYPE");
for (const [name, input, want] of CATEGORIZE) check(name, () => eq(categorize(input), want, "categorize"));

section("asset_priority.assetConfidence — 0..1 fit");
for (const [name, input, want] of CONFIDENCE) check(name, () => eq(assetConfidence(input), want, "assetConfidence"));

section("asset_taxonomy.classify — film INDUSTRY");
for (const [name, input, want] of CLASSIFY) check(name, () => eq(classify(input), want, "classify"));

section("asset_taxonomy.kindForPurpose — scene KIND");
for (const [name, input, want] of KIND) check(name, () => eq(kindForPurpose(input), want, "kindForPurpose"));

section("asset_taxonomy.profileFor / describeForDirector");
check("profileFor(saas).label", () => eq(profileFor("saas").label, "SaaS / software product", "label"));
check("profileFor(generic) -> GENERIC", () => eq(profileFor("generic"), GENERIC, "generic profile"));
check("profileFor(unknown) -> GENERIC", () => eq(profileFor("nope"), GENERIC, "unknown profile"));
check("describeForDirector(generic) exact", () => eq(
  describeForDirector("generic"),
  "Product category: general product / brand. Assets should lean toward: modern professional imagery, on-subject real photography, clean design. Reject as off-category: clip-art, watermarked stock, off-topic literal keyword puns, glamour metaphors (diamonds, gold, sports cars) for software/brands.",
  "describe generic"));

section("disjoint-domain GUARDS (block an accidental taxonomy merge)");
// A film-brief object has none of an asset record's fields -> categorize fail-opens to background.
check("brief-shaped input -> categorize background", () => eq(categorize({ subject: "a saas platform for teams" }), "background", "guard categorize"));
// An asset record has no subject/brief -> classify sees empty text -> generic.
check("asset-shaped input -> classify generic", () => eq(classify({ assetType: "logo", source: "upload", alt: "acme wordmark" }), "generic", "guard classify"));

// ---------------------------------------------------------------------------
console.log(`\n${failed ? "✗" : "✓"} taxonomy-golden: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
