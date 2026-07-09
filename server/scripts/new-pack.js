#!/usr/bin/env node
// PACK AUTHORING TOOL (Phase 5) — scale the template library by generating a
// complete, schema-valid frame pack from a compact spec. Since Phase 3, a pack
// is ONE folder (pack.json manifest + FRAME.md prose); this tool emits both from
// a FAMILY (shared structural DNA: surface, motion, fx, asset bias, prose shape)
// crossed with a VARIANT (palette + fonts + subject + name). "Parameterized
// families, not one-offs" — the same rendering code, real variety.
//
// Usage:
//   node scripts/new-pack.js                 # generate the built-in catalog
//   node scripts/new-pack.js --dry           # print what would be written
//   const { buildPack, FAMILIES } = require('./scripts/new-pack');  # programmatic
//
// Every emitted pack.json is validated against PackManifestSchema before writing,
// so a bad family/variant fails loudly instead of shipping a broken pack.

const fs = require("node:fs");
const path = require("node:path");
const { PackManifestSchema } = require("../src/services/frame_manifest");
const { isBundled } = require("../src/fonts/pack_fonts");

const REPO = path.resolve(__dirname, "..", "..");
const FRAMES_DIR = path.join(REPO, "frames");
const RESOLVABLE = new Set(["inter", "roboto", "arial", "helvetica", "georgia", "system-ui"]);

// A display font only renders if it's a bundled webfont or a safe/system family.
function assertRenderableDisplay(font) {
  if (isBundled(font) || RESOLVABLE.has(String(font).toLowerCase().trim())) return;
  throw new Error(`display font "${font}" is neither bundled (server/src/fonts/pack_fonts.js) nor a safe family — it would not render`);
}

// ---- FAMILIES: the structural DNA + a prose shape. Fields here are shared by
// every variant of the family; the variant supplies palette + fonts + subject.
const FAMILIES = {
  "retro-terminal": {
    label: "Retro Terminal",
    surface: { flat: false, lightCinematic: false },      // dark CRT ground
    motion: { cut: "push", drift: 1.03 },
    fx: { canvas: "grid", three: null },                  // synthwave horizon grid
    // headline types on, char by char, like a command; the key token in a filled box
    textfx: { enter: "typewriter", emphasis: "boxed", case: "none", tracking: 0, align: "left" },
    assets: { photoMod: "retro terminal crt scanline dark tech", iconStyle: "line", keywords: ["retro", "terminal", "mono", "crt", "dark"] },
    tone: "a retro-computer terminal: monospace type glowing on a dark CRT ground, scanline grid, one phosphor accent — for dev tools, CLIs, AI agents, hacker-grade launches",
    treatments: [
      ["Boot", "cover", "A blinking cursor and a mono wordmark on the dark ground; the headline types in like a command. One phosphor rule underlines the key token."],
      ["Readout", "feature", "Two or three mono `> key: value` rows on faint grid, each row drawing in; the featured row glows in the accent."],
      ["Metric", "stat", "A huge mono figure counts up in the accent over the grid; a caps caption sits beneath a hairline."],
      ["Prompt", "cta", "A centered `$ run` prompt: the sign-off headline over a blinking cursor and one filled-accent action key."],
    ],
  },
  "healthcare-soft": {
    label: "Healthcare Soft",
    surface: { flat: false, lightCinematic: true },       // soft light ground, gentle gradients
    motion: { cut: "wash", drift: 1.03 },
    fx: { canvas: "bokeh", three: null },
    // words drift up softly through a light blur; the key phrase gets a warm marker swipe
    textfx: { enter: "drift", emphasis: "marker", case: "none", tracking: 0, align: "left" },
    assets: { photoMod: "soft clean calm medical wellness natural light", iconStyle: "soft", keywords: ["soft", "calm", "clean", "wellness", "rounded"] },
    tone: "a calm, humane care system: soft off-white grounds, rounded cards, gentle teal/mint washes and one warm accent — for healthcare, wellness, patient and clinical products",
    treatments: [
      ["Welcome", "cover", "A soft-rounded ground; a pill label above a friendly heading, one warm underline, generous air. Nothing sharp."],
      ["Care", "feature", "Three rounded cards with a soft icon, a title and a line of body; the middle card carries the warm accent."],
      ["Outcome", "stat", "A large rounded figure in the accent with a caption; a soft progress arc behind it."],
      ["Next step", "cta", "A centered reassuring sign-off with one soft-filled pill button; plenty of calm space."],
    ],
  },
  "data-viz-mono": {
    label: "Data-Viz Mono",
    surface: { flat: false, lightCinematic: false },      // dark analyst ground
    motion: { cut: "panel", drift: 1.02 },
    fx: { canvas: "constellation", three: null },
    // characters snap in like values populating a readout; the signal term glows; mono caps
    textfx: { enter: "char-pop", emphasis: "glow", case: "upper", tracking: 0.04, align: "left" },
    assets: { photoMod: "data analytics dashboard chart monochrome", iconStyle: "line", keywords: ["data", "chart", "analytics", "mono", "grid"], prefer: ["photo", "vector"] },
    tone: "a chart-first analyst system: near-monochrome ground, a faint data grid, mono labels and ONE signal accent reserved for the data — for dashboards, analytics, data and ML products",
    treatments: [
      ["Title", "cover", "A mono caps label over a tight heading on the faint grid; one accent tick marks the key term. Reads like the cover of a data report."],
      ["Series", "feature", "Two or three mono legend rows, each a colored tick + label + value; the primary series owns the accent, the rest stay muted."],
      ["Figure", "stat", "A dominant figure over a minimal bar/line motif that draws in; the trend line is the only saturated element."],
      ["Takeaway", "cta", "A one-line conclusion over the grid with a single accent underline and a mono action label."],
    ],
  },
  "fintech-dark": {
    label: "Fintech Dark",
    surface: { flat: false, lightCinematic: false },
    motion: { cut: "panel", drift: 1.035 },
    fx: { canvas: "constellation", three: null },
    // headline reveals with a precise horizontal wipe, like a printing ledger line
    textfx: { enter: "line-wipe", emphasis: "gradient", case: "none", tracking: 0, align: "left" },
    assets: { photoMod: "premium dark fintech finance abstract", iconStyle: "duotone", keywords: ["premium", "dark", "finance", "trust", "gold"], prefer: ["photo", "vector"] },
    tone: "a premium dark-fintech system: deep near-black ground, precise numerics, one metallic accent + one signal green — for finance, fintech, trading, crypto and investor stories",
    treatments: [
      ["Cover", "cover", "Deep ground; a caps label over a confident heading, a thin metallic rule under the key word, sparse numeric chrome in a corner."],
      ["Panels", "feature", "Two or three dark glass panels with a label, a value and a caption; the lead panel carries the metallic rule."],
      ["Number", "stat", "A large precise figure with a signed +/- delta (green up), a caps caption, one metallic left-rule on the lead metric."],
      ["Close", "cta", "A centered sign-off with the ONE filled-accent CTA over the deep ground; a hairline divides the chrome."],
    ],
  },
  "saas-gradient": {
    label: "SaaS Gradient",
    surface: { flat: false, lightCinematic: true },       // bright light ground, keeps gradients
    motion: { cut: "glow", drift: 1.04 },
    fx: { canvas: "flow", three: null },
    // friendly, bouncy: words spring in with an overshoot; the brand phrase in a gradient clip; centered
    textfx: { enter: "spring", emphasis: "gradient", case: "none", tracking: 0, align: "center", sizeScale: 1.05 },
    assets: { photoMod: "modern bright saas product gradient clean", iconStyle: "duotone", keywords: ["modern", "bright", "gradient", "clean", "friendly"], prefer: ["photo", "vector"] },
    tone: "a bright modern SaaS system: near-white ground, soft brand gradients, friendly rounded type and one vivid gradient accent — for SaaS explainers, product tours and launches",
    treatments: [
      ["Hero", "cover", "A near-white ground with a soft corner gradient; a pill label over a bold friendly heading, the key phrase in a gradient clip, one underline."],
      ["Features", "feature", "Three light cards with a duotone icon, a title and a line of body; the middle card lifts on the brand gradient."],
      ["Proof", "stat", "A big figure in the gradient accent with a caption and a soft rising motif."],
      ["CTA", "cta", "A centered sign-off with one gradient-filled pill button on the bright ground."],
    ],
  },
};

// ---- helpers ---------------------------------------------------------------
function lum(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}
function yamlColors(colors) {
  return Object.entries(colors).map(([k, v]) => `  ${k}: "${v}"`).join("\n");
}

// Build the pack.json manifest object from a family + variant.
function buildManifest(v) {
  const fam = FAMILIES[v.family];
  if (!fam) throw new Error(`unknown family "${v.family}"`);
  assertRenderableDisplay(v.display);
  const fonts = [...new Set([v.body || "Inter", v.display, v.labelFont].filter(Boolean))];
  const manifest = {
    name: v.name,
    vibe: v.vibe || `${fam.tone}`,
    colors: v.colors,
    fonts,
    surface: { ...fam.surface, ground: v.ground },
    motion: v.motion || fam.motion,
    fx: v.fx || fam.fx,
    skin: {
      accents: v.accents.slice(0, 2),
      extras: (v.extras || []).slice(0, 2),
      emphasisCss: v.emphasisCss || null,
    },
    assets: { ...fam.assets, ...(v.assets || {}) },
    // Per-pack text animation + typographic treatment (the anti-sameness layer):
    // family DNA sets the baseline, the variant overrides for real per-pack variety.
    textfx: { ...(fam.textfx || {}), ...(v.textfx || {}) },
    typography: { display: v.display },
    camera3d: { ground: v.camera3dGround || (lum(v.ground) < 90 ? v.ground : v.ink) },
  };
  return PackManifestSchema.parse(manifest); // throws on any invalid field
}

// Build a concise-but-real FRAME.md (frontmatter the registry/gallery/composer
// read + prose the LLM composer uses). Not 200 lines — enough to art-direct.
function buildFrameMd(v, manifest) {
  const fam = FAMILIES[v.family];
  const display = v.display, body = v.body || "Inter", labelFont = v.labelFont || body;
  const [a1, a2] = v.accents;
  const treat = fam.treatments.map(([title, , desc], i) =>
    `### ${i + 1} · ${title}\n${desc}`).join("\n\n");
  const lightWord = lum(v.ground) > 0x88 ? "light" : "dark";
  return `---
version: alpha
name: ${v.label} — Frame (video / frame layer)
description: >
  ${manifest.vibe}
  Grounds are ${lightWord} (${v.ground}); display type is ${display}, body is ${body}.
  One accent (${a1}) marks a single focal device per frame; ${a2} is the secondary.
  Atoms are sacred · composition is free · numbers come from the script.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
${yamlColors(v.colors)}

typography:
  body:      { fontFamily: "${body}", cqw: 0.95, weight: 400, lineHeight: 1.55, color: "ink" }
  label:     { fontFamily: "${labelFont}", px: 12, weight: 600, tracking: "0.2em", upper: true, color: "accent" }
  card-title:{ fontFamily: "${display}", cqw: 1.3, weight: 700, lineHeight: 1.2, color: "ink" }
  heading-lg:{ fontFamily: "${display}", cqw: 3.4, weight: 700, lineHeight: 1.05, color: "ink" }
  heading-xl:{ fontFamily: "${display}", cqw: 4.8, weight: 700, lineHeight: 1.0, color: "ink" }
  stat-number:{ fontFamily: "${display}", cqw: 4.2, weight: 700, lineHeight: 1.0, color: "accent" }
---

# ${v.label} — Frame (video / frame layer)

## Overview

${v.label} is ${fam.tone}. ${v.overview || ""} The ground is ${lightWord} (${v.ground}); text is
${manifest.colors.ink ? "ink " + manifest.colors.ink : "high-contrast"} on it. Exactly **one accent
device** (${a1}) per frame marks the single focal point; ${a2} is a supporting hue. Restraint carries
the identity — a clear type hierarchy, generous space, and one saturated moment beat a busy frame.

## Colors

Ground \`${v.ground}\`. Text is high-contrast ink. \`${a1}\` is the one saturated device per frame
(a rule, dot, underline, or the single CTA fill); \`${a2}\` supports it. No third saturated hue in a
single frame; never a gradient on body text.

## Typography

- **Display:** ${display}, fit-to-measure (≤3 words → heading-xl; 4–6 → heading-lg; 7+ → card-title).
- **Body:** ${body} 400–500; **labels/data:** ${labelFont} caps, 0.2em tracking.
- Legibility floor ≥ 1.3cqw; the display face is the pack's voice — never swap it for a generic sans.

## Frame Treatments

> Recipe: ${lightWord} ground + ${fam.fx.canvas} texture · one accent device · clear ${display} display moment · generous space.

${treat}

## Composition Rules

### Do
- One accent device per frame; everything else in ink/muted on the ground.
- Set display in ${display}, fit-to-measure; body in ${body}; labels in ${labelFont} caps.
- Keep frames open and aligned; let the single saturated moment lead the eye.

### Don't
- No second saturated hue in one frame; no gradient on text; no generic-sans display swap.
- Don't crowd the frame or tilt/blur the structure.

## Numerals & Claims

Never invent figures. Stat blocks carry \`{metric}\` / \`±N%\` placeholders until the script supplies
values. No real third-party logos or customer marks — render any as a neutral placeholder.

## Known Gaps

- **${display}** + **${body}** are self-hosted/bundled; the composer keys off the manifest.
- 9:16 / 1:1 are guidance — preserve the whitespace ratio and the display floor.
`;
}

function buildPack(v) {
  const manifest = buildManifest(v);
  const frameMd = buildFrameMd(v, manifest);
  return { manifest, frameMd };
}

// ---- built-in CATALOG: new packs across the gap categories -----------------
const CATALOG = require("./pack-catalog");

function main() {
  const dry = process.argv.includes("--dry");
  let ok = 0;
  for (const v of CATALOG) {
    let built;
    try { built = buildPack(v); }
    catch (e) { console.error(`  ✗ ${v.name}: ${e.message}`); continue; }
    const dir = path.join(FRAMES_DIR, v.name);
    if (dry) {
      console.log(`  would write ${v.name}  (family=${v.family}, display=${v.display}, ground=${v.ground})`);
      ok++; continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify(built.manifest, null, 2) + "\n");
    fs.writeFileSync(path.join(dir, "FRAME.md"), built.frameMd);
    ok++;
    console.log(`  ✓ ${v.name.padEnd(22)} family=${v.family.padEnd(16)} display=${v.display}`);
  }
  console.log(`\n${dry ? "would generate" : "generated"} ${ok}/${CATALOG.length} packs`);
}

if (require.main === module) main();
module.exports = { buildPack, buildManifest, buildFrameMd, FAMILIES };
