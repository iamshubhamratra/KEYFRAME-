// FAMILY LEGIBILITY SWEEP — builds one film per templated pack and runs the
// WCAG audit over it. Run: npm run audit:families [-- pack1 pack2 …]
//
// Why this exists: check:templates asserts STRUCTURE (parses, clips, tracks) and
// stays green on a film nobody can read. QA judges legibility, and it blocked a
// shipped film for text at 3.63:1. The failures are also PACK-specific — a family
// passes on one pack's palette and fails on another's (story passed everywhere
// except daybreak-bakehouse's paper; bright's avatar monogram measured 1.07:1 on
// one gradient) — so sweeping the family's representative pack is not enough.
//
// Needs the renderer's Chromium (already a dependency). Slow-ish: a few seconds
// per pack, so it is a pre-release sweep rather than an every-edit gate.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const frameRegistry = require("../src/services/frame_registry");
const frameManifest = require("../src/services/frame_manifest");
const { contrastCheck } = require("../src/services/contrast_check");

const COMPOSERS = {
  momentum: "momentum_composer",
  "poster-loud": "family_poster",
  "retro-terminal": "family_terminal",
  "editorial-quiet": "family_editorial",
  "story-handmade": "family_story",
  "bright-minimal": "family_bright",
  cinema: "family_cinema",
  "dark-premium": "family_darkpremium",
  charged: "family_charged",
  // Per-template composers added alongside the families (one pack each).
  "daybreak-bakehouse": "daybreak_composer",
  "organic-garden": "organic_composer",
  "lantern-night": "lantern_composer",
  "hype-wave": "hype_composer",
  "poster-pop": "posterpop_composer",
  "story-blocks": "storyblocks_composer",
  "premiere-night": "premiere_composer",
};

const storyboard = {
  title: "Northwind", durationSec: 26,
  scenes: [
    { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "hook", headline: "Ship faster than ever", subtext: "One workspace for the whole team." },
    { id: "s2", start: 4, duration: 4, kind: "text", purpose: "feature", headline: "Everything in one canvas", subtext: "Plan, review and ship without switching tabs.", bullets: ["Real-time boards", "AI-native review"] },
    { id: "s3", start: 8, duration: 4, kind: "text", purpose: "how", headline: "How it works", bullets: ["Connect your repo", "Plan the sprint", "Ship on Friday"] },
    { id: "s4", start: 12, duration: 4, kind: "stat", purpose: "data", headline: "Proof not promises", bullets: ["240% faster ships", "12k teams onboard"] },
    { id: "s5", start: 16, duration: 4, kind: "quote", purpose: "testimonial", quote: "The fastest we have ever shipped.", author: "Alex Rivera", role: "Head of Product" },
    { id: "s6", start: 20, duration: 3, kind: "text", purpose: "showcase", headline: "Every corner of it", subtext: "4.9 stars from real teams." },
    { id: "s7", start: 23, duration: 3, kind: "cta", purpose: "cta", headline: "Start building today", emphasis: "Start free" },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({ start: s.start + 0.3, end: s.start + s.duration - 0.3, text: s.subtext || s.headline || s.quote }));

const argv = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const portrait = process.argv.includes("--portrait");
const samples = Number((process.argv.find((a) => a.startsWith("--samples=")) || "").split("=")[1]) || 5;
const dims = portrait ? { width: 720, height: 1280, fps: 30 } : { width: 1280, height: 720, fps: 30 };

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "famaudit-"));
  const packs = fs.readdirSync(frameRegistry.FRAMES_DIR)
    .filter((p) => fs.existsSync(path.join(frameRegistry.FRAMES_DIR, p, "pack.json")))
    .filter((p) => !argv.length || argv.includes(p));

  let checked = 0, failed = 0;
  const failures = [];
  for (const pack of packs) {
    let renderer = null;
    try { renderer = (frameManifest.getManifest(pack) || {}).renderer || null; } catch { /* none */ }
    const mod = renderer && COMPOSERS[renderer];
    if (!mod) continue;
    const dir = path.join(work, pack);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const built = require(`../src/services/${mod}`).buildComposition({ storyboard, dims, framePack: pack, captionCues, assets: [] });
      fs.writeFileSync(path.join(dir, "index.html"), built.indexHtml, "utf8");
      fs.writeFileSync(path.join(dir, "meta.json"), built.metaJson, "utf8");
    } catch (e) {
      console.log(`  ✗  ${pack} (${renderer}) — build threw: ${e.message}`); failed++; continue;
    }
    checked++;
    let res;
    try { res = await contrastCheck(dir, { samples }); }
    catch (e) { console.log(`  ?  ${pack}: audit error ${String(e.message).slice(0, 80)}`); continue; }
    const bad = (res && res.failures) || [];
    if (bad.length) {
      failed++;
      failures.push({ pack, renderer, bad });
      console.log(`  ✗  ${pack} (${renderer}) — ${bad.length} element(s) below AA`);
      for (const f of bad.slice(0, 4)) {
        console.log(`       ${String(f.ratio).padStart(5)}:1 need ${f.needed}  ${f.selector || f.id || "?"}  "${String(f.text || "").slice(0, 32)}"`);
      }
    } else {
      console.log(`  ✓  ${pack} (${renderer})`);
    }
  }
  console.log(`\n${checked} pack(s) audited at ${dims.width}x${dims.height}, ${failed} with AA failures.`);
  try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* leave temp */ }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
