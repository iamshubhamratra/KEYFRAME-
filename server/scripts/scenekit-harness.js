// DEV HARNESS — build a default scene-kit composition into a job dir for standalone render.
// Usage: node scripts/scenekit-harness.js <outDir> <packId> [shot|none|uploads] [W] [H] [#hex,#hex,...]
//   hex list → an Art Director BRAND SKIN, to eyeball what a brand may and may not
//     steer across the 24 packs the kit composes. Omit it and the film must render
//     byte-identically to the pack default — a null skin is a no-op by contract
//     (brand_kit.js:25), so a diff here is a bug.
//   mode "uploads" → fabricate USER UPLOADS (source:"upload" tier-100 + a logo), to
//     eyeball that uploads take the hero/montage slots ahead of stock and the logo
//     lands at the open + CTA (never a persistent watermark). Prints the coverage
//     report the ProductionTheater panel shows.
// Then render:  cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const scenekit = require("../src/services/scene_kit");
const { coverageFromUsed } = require("../src/services/asset_coverage");

const outDir = path.resolve(process.argv[2] || "jobs/_sktest");
const pack = process.argv[3] || "nimbus-saas";
const mode = process.argv[4] || "shot";
const W = Number(process.argv[5]) || 720;
const H = Number(process.argv[6]) || 1280;
// Shaped like the Art Director's real output (art_director.js:132): accents lead, and
// emphasis is an explicit 2-stop pair — deriveTheme hands both to resolveBrand, which
// ranks the pair by ARRIVAL on the pack's ground, so the same hexes deliberately lead
// differently on a dark pack than on a light one.
const brandHexes = String(process.argv[7] || "").split(",").map((s) => s.trim()).filter(Boolean);
const brandSkin = brandHexes.length
  ? { accents: brandHexes.slice(0, 3), emphasis: [brandHexes[0], brandHexes[1] || brandHexes[0]], source: "harness", provenance: "explicit" }
  : null;

fs.mkdirSync(path.join(outDir, "assets", "images"), { recursive: true });
fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

// A realistic SaaS launch storyboard exercising hook / screenshot-hero / feature
// text / montage / stat / cta — the scene-kit work-horse archetypes.
const storyboard = {
  title: "NIMBUS",
  durationSec: 21,
  scenes: [
    { id: "s1", start: 0,  duration: 3, purpose: "hook",     kind: "hook",  headline: "Ship faster, every day",        emphasis: "faster",  subtext: "The launch platform for modern teams." },
    { id: "s2", start: 3,  duration: 4, purpose: "solution", kind: "title", headline: "One clean dashboard",            emphasis: "clean",   subtext: "Every metric, live, in one place." },
    { id: "s3", start: 7,  duration: 4, purpose: "features", kind: "caption", headline: "Built for teams",              emphasis: "teams",   subtext: "Roles, reviews and realtime sync." },
    { id: "s4", start: 11, duration: 3, purpose: "proof",    kind: "caption", headline: "Everything in one workspace",  emphasis: "one" },
    { id: "s5", start: 14, duration: 3, purpose: "benefits", kind: "stat",  headline: "faster decisions",               emphasis: "10x",     subtext: "10x" },
    { id: "s6", start: 17, duration: 4, purpose: "cta",      kind: "cta",   headline: "Start building today",           emphasis: "today",   subtext: "nimbus.app" },
  ],
};

let assets = [];
if (mode === "uploads") {
  // Fabricate the user's own material with ffmpeg (no fixtures needed): 4 product
  // images (2 wide "dashboards", 1 tall "mobile", 1 square "photo") + a logo. These
  // carry source:"upload", tier 100, and the classification the intake vision pass
  // would have written — so the kit routes and weaves them exactly as in production.
  const upDir = path.join(outDir, "uploads");
  fs.mkdirSync(upDir, { recursive: true });
  const mk = (name, w, h, color) => {
    const p = path.join(upDir, name);
    try { execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${color}:s=${w}x${h}`, "-frames:v", "1", p]); } catch { /* ffmpeg missing → skip */ }
    return p;
  };
  const specs = [
    { id: "u1", name: "u1.png", w: 1600, h: 1000, color: "royalblue", assetType: "dashboard", kindHint: "screenshot" },
    { id: "u2", name: "u2.png", w: 1500, h: 940, color: "teal", assetType: "ui-design", kindHint: "screenshot" },
    { id: "u3", name: "u3.png", w: 720, h: 1480, color: "purple", assetType: "mobile-app", kindHint: "screenshot" },
    { id: "u4", name: "u4.png", w: 1200, h: 1200, color: "orange", assetType: "product-photo", kindHint: "photo" },
  ];
  for (const s of specs) {
    if (!fs.existsSync(mk(s.name, s.w, s.h, s.color))) continue;
    assets.push({
      path: `uploads/${s.name}`, type: "image", source: "upload", priorityTier: 100, uploadId: s.id,
      kindHint: s.kindHint, assetType: s.assetType, sceneId: null,
      width: s.w, height: s.h, ratio: Math.round((s.w / s.h) * 1000) / 1000,
      alt: `THE USER'S OWN uploaded ${s.assetType.replace(/-/g, " ")}`, license: "owner content",
    });
  }
  if (fs.existsSync(mk("logo.png", 400, 400, "crimson"))) {
    assets.push({ path: "uploads/logo.png", type: "image", role: "logo", source: "upload", priorityTier: 100, uploadId: "logo", hasAlpha: true, alt: "the user's own brand logo" });
  }
} else if (mode === "shot") {
  // Real website screenshots from a recent job dir (wide → browser-chrome hero).
  const src = fs.existsSync("jobs/_blport/assets/images") ? "jobs/_blport/assets/images"
    : (fs.existsSync("jobs/elnc5oal1s/assets/images") ? "jobs/elnc5oal1s/assets/images" : null);
  if (src) {
    const shots = fs.readdirSync(src).filter((f) => /^site_.*\.png$/i.test(f));
    shots.forEach((n, i) => {
      fs.copyFileSync(path.join(src, n), path.join(outDir, "assets", "images", n));
      assets.push({
        path: `assets/images/${n}`, type: "image",
        source: "website", visionOk: true,
        alt: `product dashboard screenshot ${i + 1}`,
        sceneId: null, width: 1440, height: 900, ratio: 1.6, cropFocus: "top center",
      });
    });
    // A couple of supporting vectors so the montage archetype has a pool.
    const vecs = fs.readdirSync(src).filter((f) => /\.svg$/i.test(f)).slice(0, 4);
    vecs.forEach((n) => {
      fs.copyFileSync(path.join(src, n), path.join(outDir, "assets", "images", n));
      assets.push({
        path: `assets/images/${n}`, type: "image",
        source: "pixabay", visionOk: true, style: "vector illustration",
        alt: "supporting product visual", sceneId: null, width: 800, height: 600, ratio: 1.33,
      });
    });
  }
}

const { indexHtml, metaJson, resolvedBrand, usedAssets, logoPlacements } = scenekit.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: pack, assets, seedKey: "skport", brandSkin,
});
fs.writeFileSync(path.join(outDir, "index.html"), indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), metaJson, "utf8");
console.log(`[harness] wrote ${outDir} (pack=${pack}, mode=${mode}, ${W}x${H}, ${assets.length} assets, brand=${brandSkin ? brandSkin.accents.join("/") : "none (pack accents)"})`);
// User-asset coverage — what the ProductionTheater panel would show. Only when the
// harness fabricated uploads.
if (assets.some((a) => a.source === "upload")) {
  const cov = coverageFromUsed({ assets, usedAssets, logoPlacements });
  console.log(`[harness] coverage: ${cov.usagePercentage}% yours on screen (${cov.assetsUsed}/${cov.uploadedAssets} uploads) · logo=${cov.logoUsed ? logoPlacements.join("+") : "not placed"}`);
  cov.perAsset.forEach((p) => console.log(`[harness]   ${p.id} (${p.assetType || "?"}) → ${p.via}`));
  cov.notes.forEach((n) => console.log(`[harness]   note: ${n}`));
}
// What the film WORE, not what was asked for — the two differ whenever this pack's
// ground forced a nudge or a drop, and that gap is the whole point of printing it.
if (resolvedBrand) {
  console.log(`[harness] resolvedBrand: tier=${resolvedBrand.tier} accents=${resolvedBrand.accents.slice(0, 3).join("/")} emphasis=${resolvedBrand.emphasis.join("/")}`);
  resolvedBrand.adjusted.forEach((a) => console.log(`[harness]   adjusted ${a.from} -> ${a.to}: ${a.reason}`));
  resolvedBrand.dropped.forEach((d) => console.log(`[harness]   dropped ${d.hex}: ${d.reason}`));
} else if (brandSkin) {
  console.log(`[harness] resolvedBrand: null — no brand color survived ${pack}'s ground; the pack's own accents stand`);
}
