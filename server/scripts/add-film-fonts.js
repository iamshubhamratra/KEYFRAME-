#!/usr/bin/env node
// ADD-FILM-FONTS — resolve and install the @fontsource packages the FilmKit packs need.
//
// The 70 imported templates name 121 distinct Google families between them, and the renderer
// cannot load a webfont — every face has to be bundled as base64 in src/fonts/pack_fonts.js
// or the pack renders in a substitute, which is the single largest typographic difference
// between a KEYFRAME render and its reference.
//
//   node scripts/add-film-fonts.js --plan      # resolve names + report, install nothing
//   node scripts/add-film-fonts.js --install   # npm install the missing packages
//   node scripts/add-film-fonts.js --emit      # print the NEW_FACES block for gen-pack-fonts
//
// VARIABLE FIRST, exactly as gen-pack-fonts.js already prefers: one file spanning every
// weight, declared over `font-weight:1 1000`. A family with no variable build gets its real
// 400/700 files, because a synthesised bold is visibly wrong on display type.

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SKIN_DIR = path.join(ROOT, "src", "services", "film_skins");
const FLAGS = new Set(process.argv.slice(2));

// Families already bundled — read from the live module so this can never drift.
const bundled = new Set(Object.keys(require(path.join(ROOT, "src", "fonts", "pack_fonts.js")).FONT_FACES));

// Every family the skins on disk actually name.
//
// READ THE MODULES, NOT `_manifest.json`. That file is written by gen-film-skins.js and lists
// only the 70 generated FilmKit templates; the nine hand-ported one-off films are written
// straight into film_skins/ and were therefore invisible here — cat-nap named Lora, puppy-park
// named Baloo 2 at weight 800, road-trip named Permanent Marker, and none of them were
// bundled, so all nine rendered their headlines in a substitute face. Loading each skin is the
// only source of truth for what it asks for.
function requiredFamilies() {
  const out = new Set();
  for (const f of fs.readdirSync(SKIN_DIR).filter((x) => x.endsWith(".js") && !x.startsWith("_"))) {
    try {
      const { SKIN } = require(path.join(SKIN_DIR, f));
      if (!SKIN) continue;
      for (const k of ["display", "body", "mono"]) if (SKIN[k]) out.add(String(SKIN[k]));
    } catch (e) {
      console.warn(`[fonts] could not read ${f}: ${e.message}`);
    }
  }
  return [...out].sort();
}

// "Alfa Slab One" -> "alfa-slab-one". @fontsource's own convention.
const pkgName = (family) => String(family).toLowerCase()
  .replace(/\+/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function head(url) {
  return new Promise((resolve) => {
    https.get(url, { method: "GET", headers: { "user-agent": "keyframe-font-check" } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on("error", () => resolve(0));
  });
}

async function resolve(families) {
  const plan = [];
  for (const family of families) {
    if (bundled.has(family)) { plan.push({ family, status: "bundled" }); continue; }
    const pkg = pkgName(family);
    // Prefer the variable build; fall back to the static family.
    const varStatus = await head(`https://registry.npmjs.org/@fontsource-variable%2f${pkg}`);
    if (varStatus === 200) { plan.push({ family, pkg, kind: "variable", spec: `@fontsource-variable/${pkg}`, status: "new" }); continue; }
    const stStatus = await head(`https://registry.npmjs.org/@fontsource%2f${pkg}`);
    if (stStatus === 200) { plan.push({ family, pkg, kind: "static", spec: `@fontsource/${pkg}`, status: "new" }); continue; }
    plan.push({ family, pkg, status: "MISSING" });
  }
  return plan;
}

(async () => {
  const families = requiredFamilies();
  const plan = await resolve(families);
  const already = plan.filter((p) => p.status === "bundled");
  const fresh = plan.filter((p) => p.status === "new");
  const missing = plan.filter((p) => p.status === "MISSING");

  console.log(`families named by the skins: ${families.length}`);
  console.log(`  already bundled: ${already.length}`);
  console.log(`  resolvable:      ${fresh.length}  (${fresh.filter((p) => p.kind === "variable").length} variable, ${fresh.filter((p) => p.kind === "static").length} static)`);
  console.log(`  NOT ON NPM:      ${missing.length}${missing.length ? "  -> " + missing.map((m) => m.family).join(", ") : ""}`);

  fs.writeFileSync(path.join(__dirname, "..", "src", "fonts", "_film_font_plan.json"), JSON.stringify(plan, null, 2), "utf8");

  if (FLAGS.has("--install") && fresh.length) {
    // One npm call: 100 separate installs would re-resolve the tree 100 times.
    const specs = fresh.map((p) => `${p.spec}@latest`);
    console.log(`installing ${specs.length} package(s)...`);
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--save-dev", ...specs], {
      cwd: ROOT, stdio: "inherit", shell: process.platform === "win32",
    });
    console.log("done");
  }

  if (FLAGS.has("--emit")) {
    const lines = fresh.map((p) => p.kind === "variable"
      ? `  ${JSON.stringify(p.family)}: { pkg: ${JSON.stringify(p.pkg)}, variable: true },`
      : `  ${JSON.stringify(p.family)}: { pkg: ${JSON.stringify(p.pkg)}, weights: [400, 700] },`);
    console.log("\n// --- generated by add-film-fonts.js ---\n" + lines.join("\n"));
  }
})();
