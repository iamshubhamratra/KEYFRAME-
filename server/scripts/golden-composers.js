// Golden-output harness for the portrait composers.
//
// Builds every portrait pack against a fixed storyboard + asset set and prints a hash of the
// emitted document. Its ONLY job is to prove a refactor is behaviour-preserving: capture
// hashes before, refactor, capture after, diff. Any change is a real change.
//
// Run with no argument to CHECK against the committed baseline (this is what npm test does);
// run with --update after an INTENTIONAL visual change, and review the diff in the commit.
//
//   node scripts/golden-composers.js              # verify
//   node scripts/golden-composers.js --update     # re-baseline (intentional changes only)
const crypto = require("node:crypto");
const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");

const DIMS = { width: 1080, height: 1920, fps: 30 };
const ASSETS = [
  { path: "assets/s0.png", type: "image", ratio: 0.667, width: 800, height: 1200, source: "website", kindHint: "screenshot", cdProminence: "hero", visionOk: true, cdScore: 0.92, sceneId: "s2", alt: "product screenshot" },
  { path: "assets/s1.png", type: "image", ratio: 1.78, width: 1600, height: 900, source: "upload", kindHint: "screenshot", cdProminence: "support", cdScore: 0.85, sceneId: "s3", alt: "dashboard" },
  { path: "assets/s2.png", type: "image", ratio: 1.4, width: 1400, height: 1000, source: "website-asset", kindHint: "photo", cdProminence: "support", visionOk: true, cdScore: 0.7, sceneId: "s4", alt: "brand image" },
  { path: "assets/logo.png", type: "image", width: 400, height: 400, source: "website-brand", role: "logo", alt: "logo" },
];
const SB = { title: "Acme", durationSec: 16, scenes: [
  { id: "s1", start: 0, duration: 3, kind: "hook", purpose: "intro", headline: "Ship faster with Acme", subtext: "The developer cloud." },
  { id: "s2", start: 3, duration: 3.5, kind: "feature", purpose: "feature", headline: "One dashboard for everything", onScreenText: ["Deploys", "Metrics", "Logs"] },
  { id: "s3", start: 6.5, duration: 3.5, kind: "quote", purpose: "testimonial", headline: "The best tool we use", subtext: "CTO, Acme" },
  { id: "s4", start: 10, duration: 3, kind: "stat", purpose: "result", headline: "Deploy in 8 seconds", emphasis: "8s" },
  { id: "s5", start: 13, duration: 3, kind: "cta", purpose: "cta", headline: "Acme Cloud", emphasis: "Start free", subtext: "acme.dev" },
] };
// A brand skin too, so the colour maths (the bulk of what gets consolidated) is exercised.
const SKIN = { accents: ["#e0218a", "#1f6feb"], emphasis: "#e0218a", tier: "explicit", applied: true, provenance: "explicit" };

const BASELINE = require("node:path").join(__dirname, "golden-composers.txt");
const fs = require("node:fs");
const UPDATE = process.argv.includes("--update");
const lines = [];

// EVERY pack with a dedicated composer — not just the portrait-declared ones.
//
// This filtered on `orientation === "portrait"`, which silently excluded flagship and
// brightlife: neither declares an orientation, so the two benchmark packs had NO golden
// coverage at all. A change to either reported "byte-identical" because they were never in
// the baseline. Scene-kit packs are excluded on purpose — they share one composer that the
// portrait/asset guards already exercise.
const packs = frameRegistry.listPacks().filter((p) => composerModuleFor((fm.getManifest(p) || {}).renderer));
for (const pack of packs) {
  const comp = composerModuleFor((fm.getManifest(pack) || {}).renderer);
  if (!comp) { console.log(`${pack.padEnd(20)} SKIP`); continue; }
  for (const [label, brandSkin] of [["plain", null], ["brand", SKIN]]) {
    let h;
    try {
      const built = comp.buildComposition({ storyboard: JSON.parse(JSON.stringify(SB)), dims: DIMS, framePack: pack, captionCues: [], assets: ASSETS, brandSkin });
      h = crypto.createHash("sha256").update(built.indexHtml + "\u0000" + (built.metaJson || "")).digest("hex").slice(0, 16);
    } catch (e) { h = "ERROR:" + e.message.split("\n")[0].slice(0, 60); }
    lines.push(`${pack.padEnd(20)} ${label.padEnd(6)} ${h}`);
  }
}

const NL = "\n";
const out = lines.join(NL) + NL;
if (UPDATE || !fs.existsSync(BASELINE)) {
  fs.writeFileSync(BASELINE, out, "utf8");
  console.log(`golden: wrote baseline for ${packs.length} pack(s) with a dedicated composer x 2 modes`);
  process.exit(0);
}
const prev = fs.readFileSync(BASELINE, "utf8");
if (prev === out) {
  console.log(`golden: ${lines.length} composition(s) byte-identical to baseline`);
  process.exit(0);
}
const a = prev.split(NL), b = out.split(NL);
console.error("golden: OUTPUT CHANGED — a composer now emits a different document.");
console.error("If the change was intentional, re-run with --update and review the diff.");
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) console.error(`  - ${a[i] || "(missing)"}${NL}  + ${b[i] || "(missing)"}`);
}
process.exit(1);
