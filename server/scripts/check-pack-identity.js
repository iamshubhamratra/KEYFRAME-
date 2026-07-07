#!/usr/bin/env node
// PACK IDENTITY REGRESSION (Phase 5) — a fast, deterministic guard that every
// installed pack still RENDERS its manifest identity, so a future "safety net"
// layer can't silently flatten packs again (the class of bug where enrich
// repainted authored grounds, or the typography eraser dropped display fonts).
//
// For each pack it builds the canonical composition and asserts, against the
// manifest source of truth:
//   1. the authored ground is the comp's #root background,
//   2. the display face renders — a bundled webfont injects its @font-face and
//      the .kfw rule uses it; a safe/system face appears in the display stack,
//   3. enrich passes the (rich) comp through UNTOUCHED (no double-decoration,
//      no ground override),
//   4. the comp is substantial (not a bare/empty frame).
//
// Exits non-zero on any failure — wire into CI. No video render needed.

const path = require("node:path");
const sk = require("../src/services/scene_kit");
const man = require("../src/services/frame_manifest");
const reg = require("../src/services/frame_registry");
const { enrichComposition } = require("../src/services/enrich");
const { isBundled } = require("../src/fonts/pack_fonts");

const dims = { width: 1280, height: 720, fps: 24 };
const storyboard = {
  title: "Identity check",
  scenes: [
    { id: "s1", start: 0, duration: 3, kind: "hook", headline: "Identity check", emphasis: "check" },
    { id: "s2", start: 3, duration: 3, kind: "bullet", headline: "Everything in one place", subtext: "Built to move fast." },
    { id: "s3", start: 6, duration: 3, kind: "cta", headline: "Get started" },
  ],
};

const packs = reg.listPacks();
let failed = 0;
for (const name of packs) {
  const m = man.getManifest(name);
  const problems = [];
  if (!m) { problems.push("no manifest"); }
  const built = sk.buildComposition({ storyboard, dims, framePack: name, assets: [], seedKey: `id-${name}` });
  const html = built.indexHtml;

  if (m) {
    // 1) authored ground
    const groundM = /#root \{[^}]*background:(#[0-9A-Fa-f]{6})/.exec(html);
    const ground = groundM && groundM[1].toUpperCase();
    if (m.surface.ground && ground !== m.surface.ground.toUpperCase()) {
      problems.push(`ground ${ground} != manifest ${m.surface.ground}`);
    }
    // 2) display face renders
    const disp = m.typography && m.typography.display;
    if (disp) {
      if (isBundled(disp)) {
        if (!html.includes("@font-face") || !html.includes(disp)) problems.push(`display "${disp}" bundled but no @font-face/usage`);
        if (!new RegExp(`\\.kfw[^}]*'${disp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`).test(html)) problems.push(`display "${disp}" not applied to .kfw`);
      } else {
        // safe/system face — should be in the .kfw display stack
        if (!new RegExp(`\\.kfw[^}]*${disp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(html)) problems.push(`safe display "${disp}" not in .kfw stack`);
      }
    }
    // 3) enrich passthrough (rich comp must not be re-decorated/overridden)
    const en = enrichComposition(html, { width: dims.width, height: dims.height, duration: 9, packTokens: reg.getPackTokens(name) });
    if (en.html !== html) problems.push("enrich modified the comp (flatten/override regression)");
  }
  // 4) substantial
  if (html.length < 3000) problems.push(`comp too small (${html.length}b)`);

  if (problems.length) { failed++; console.log(`  ✗ ${name.padEnd(20)} ${problems.join("; ")}`); }
  else console.log(`  ✓ ${name}`);
}

console.log(`\n${failed ? "✗ " + failed + "/" + packs.length + " packs FAILED identity" : "✓ all " + packs.length + " packs keep their identity"}`);
process.exit(failed ? 1 : 0);
