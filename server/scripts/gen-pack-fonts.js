// PACK FONT MODULE GENERATOR — rebuilds src/fonts/pack_fonts.js from @fontsource woff2.
//
// WHY THIS EXISTS AGAIN. The original generator lived in a scratchpad and is gone, so the
// module could only be extended by hand. Eleven of the sixteen imported templates were
// rendering in SUBSTITUTE faces because their reference families were never bundled, which is
// the single largest typographic difference between a KEYFRAME render and its Claude Design
// reference. This regenerates the whole module from a declared list.
//
//   node scripts/gen-pack-fonts.js            # rewrite src/fonts/pack_fonts.js
//   node scripts/gen-pack-fonts.js --check    # report only, touch nothing
//
// VARIABLE FIRST. A variable face is one file spanning every weight, declared over
// `font-weight:1 1000` so any heading weight maps to it — that is the convention the eleven
// original entries already use. Families with no variable build get their real 400 and 700
// files as two separate rules, because a synthesised bold is visibly wrong on display type.
//
// PRESERVED ENTRIES: the eleven original families are read back out of the existing module
// rather than regenerated. Two of them (Caprasimo, Figtree) came from the imported OM template
// bundles, not from @fontsource, and are not reproducible from node_modules.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "fonts", "pack_fonts.js");
const NM = path.join(ROOT, "node_modules");

// A FACE MUST CARRY THE AXES ITS DESIGN ASKS FOR.
//
// @fontsource-variable publishes one file per axis SLICE, and this generator only ever reached
// for `<pkg>-latin-wght-normal.woff2` — every axis but weight pinned at its default. For a family
// with an OPTICAL SIZE axis that silently substitutes a different typeface: the reference asks
// Google for `Fraunces:opsz,wght@9..144,500`, so `font-optical-sizing: auto` (the CSS default)
// drives opsz to the display size and draws the high-contrast Didone cut, while our wght-only
// slice is frozen at opsz 14 — the sturdy text cut, which reads as a heavy slab at 120px and was
// reported as "wrong display serif family on every frame" for bonsai-bench.
//
// `axis` names the slice to inline. Surveying every `family=` request in the 92 handoff sources
// (scripts/font-axis-survey.js) finds exactly ONE family asked for with a non-weight axis, so
// this stays a one-line table rather than a policy: re-run the survey when templates are added.
// family -> { pkg, variable, axis? } | { pkg, weights: [...] }
const NEW_FACES = {
  "Baloo 2": { pkg: "baloo-2", variable: true },
  Fredoka: { pkg: "fredoka", variable: true },
  "Hanken Grotesk": { pkg: "hanken-grotesk", variable: true },
  Karla: { pkg: "karla", variable: true },
  Manrope: { pkg: "manrope", variable: true },
  Nunito: { pkg: "nunito", variable: true },
  Oswald: { pkg: "oswald", variable: true },
  Outfit: { pkg: "outfit", variable: true },
  Sora: { pkg: "sora", variable: true },
  // No variable build published — real 400 + 700 rather than a synthesised bold.
  "Chakra Petch": { pkg: "chakra-petch", weights: [400, 700] },
  Spectral: { pkg: "spectral", weights: [400, 700] },
  "Barlow Semi Condensed": { pkg: "barlow-semi-condensed", weights: [400, 700] },
  "DM Mono": { pkg: "dm-mono", weights: [400, 500] },
  "Space Mono": { pkg: "space-mono", weights: [400, 700] },
  Chewy: { pkg: "chewy", weights: [400] },   // single-weight display face
  // The one optical-size family in the library — see the note above the table.
  Fraunces: { pkg: "fraunces", variable: true, axis: "opsz" },
};

// Families to REBUILD even though the module already has an entry. Normally a bundled family is
// carried through verbatim so the originals survive; a face bundled from the wrong axis slice is
// the exception, because "already bundled" is exactly what hid the defect.
const REBUILD = new Set(["Fraunces"]);

const b64 = (p) => fs.readFileSync(p).toString("base64");
const rule = (family, weight, file) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;`
  + `src:url(data:font/woff2;base64,${b64(file)}) format('woff2');}`;

function build(family, spec) {
  if (spec.variable) {
    const axis = spec.axis || "wght";
    const f = path.join(NM, "@fontsource-variable", spec.pkg, "files", `${spec.pkg}-latin-${axis}-normal.woff2`);
    if (!fs.existsSync(f)) throw new Error(`missing ${axis} variable file for ${family}: ${f}`);
    return rule(family, "1 1000", f);
  }
  // ASK THE PACKAGE WHAT IT SHIPS. Most display faces are single-weight (Abril Fatface,
  // Bungee, Monoton, Titan One…), so a blanket [400,700] request throws on the 700 that was
  // never published. Scan the files directory and take what is actually there, preferring
  // the requested weights when they exist.
  const dir = path.join(NM, "@fontsource", spec.pkg, "files");
  if (!fs.existsSync(dir)) throw new Error(`package not installed for ${family}: ${dir}`);
  const have = fs.readdirSync(dir)
    .map((f) => new RegExp(`^${spec.pkg}-latin-(\\d+)-normal\\.woff2$`).exec(f))
    .filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
  if (!have.length) throw new Error(`no latin normal woff2 for ${family} in ${dir}`);
  const want = (spec.weights || []).filter((w) => have.includes(w));
  // Nothing requested is published: fall back to the family's own range — its lightest
  // usable text weight and its heaviest, which is what display type actually needs.
  const use = want.length ? want : [...new Set([have.find((w) => w >= 400) || have[0], have[have.length - 1]])];
  // A single-weight family still maps across 1 1000 so any authored weight resolves to it
  // instead of the browser synthesising a bold.
  if (use.length === 1) return rule(family, "1 1000", path.join(dir, `${spec.pkg}-latin-${use[0]}-normal.woff2`));
  return use.map((w) => rule(family, w, path.join(dir, `${spec.pkg}-latin-${w}-normal.woff2`))).join("");
}

// THE FILMKIT FAMILIES. The 70 imported FilmKit packs name 121 distinct Google families
// between them and the renderer cannot load a webfont, so every one has to be inlined here
// or the pack renders in a substitute — the single largest typographic difference between a
// KEYFRAME render and its reference. scripts/add-film-fonts.js resolves each family against
// the npm registry (variable build preferred) and writes the plan; this merges it in, so
// adding a template never means hand-editing the table above.
try {
  const plan = require(path.join(ROOT, "src", "fonts", "_film_font_plan.json"));
  for (const p of plan) {
    if (p.status !== "new" || NEW_FACES[p.family]) continue;
    NEW_FACES[p.family] = p.kind === "variable"
      ? { pkg: p.pkg, variable: true }
      : { pkg: p.pkg, weights: [400, 700] };
  }
} catch { /* no plan yet — the eleven original families still regenerate */ }

// Read the existing module's entries so the originals survive verbatim.
const existing = require(OUT).FONT_FACES;

const check = process.argv.includes("--check");
const faces = {};
let added = 0;
for (const [k, v] of Object.entries(existing)) faces[k] = v;
for (const [family, spec] of Object.entries(NEW_FACES)) {
  if (faces[family] && !REBUILD.has(family)) { console.log(`skip  ${family} (already bundled)`); continue; }
  const was = faces[family];
  const css = build(family, spec);
  faces[family] = css;
  added++;
  const how = spec.variable ? `variable ${spec.axis || "wght"}` : `static ${spec.weights.join("+")}`;
  console.log(`${was ? "REBLD" : "add  "} ${family.padEnd(24)} ${how.padEnd(16)} ${(css.length / 1024).toFixed(0)}KB`);
}

const total = Object.values(faces).reduce((a, s) => a + s.length, 0);
console.log(`\n${Object.keys(faces).length} families · ${(total / 1024).toFixed(0)}KB inlined (added ${added})`);
if (check) process.exit(0);

const header = `// AUTO-GENERATED by scripts/gen-pack-fonts.js — committed on purpose. Base64 data-URI
// @font-face rules for the frame packs' faces, so every pack renders in its REAL typeface
// deterministically (no @fontsource runtime dep, no network, no file server).
//
// Source: @fontsource / @fontsource-variable woff2 (OFL/Apache-licensed), latin subset.
// Variable families are one file declared over font-weight:1 1000 so any authored weight maps
// to it; families with no variable build ship their real 400 and 700 files, because a
// synthesised bold is visibly wrong on display type.
//
// Caprasimo + Figtree came instead from the imported OM template bundles (same OFL fonts,
// Google's own latin subset) and are NOT reproducible from node_modules — the generator
// carries them through verbatim.
//
// SYSTEM/SAFE display faces (Inter, Georgia) are intentionally ABSENT — the
// renderer already resolves them; only true webfonts need inlining here.

const FONT_FACES = {
`;
const body = Object.entries(faces).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n");
const footer = `
};

// Concatenated @font-face CSS for a display family, or "" if it needs none
// (system/safe font) or isn't bundled. Case-insensitive on the family name.
function fontFaceCss(family) {
  if (!family) return "";
  const key = Object.keys(FONT_FACES).find((k) => k.toLowerCase() === String(family).toLowerCase().trim());
  return key ? FONT_FACES[key] : "";
}

// Whether a display family is a bundled webfont (has an inlined @font-face).
function isBundled(family) { return !!fontFaceCss(family); }

module.exports = { FONT_FACES, fontFaceCss, isBundled };
`;
fs.writeFileSync(OUT, header + body + footer);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
