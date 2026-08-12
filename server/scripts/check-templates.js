// TEMPLATE GATE — builds EVERY pack that declares a dedicated renderer, in both
// orientations, and asserts the render contract holds. Run: npm run check:templates
//
// Family templates (template_engine.js) mean one design file now drives a dozen
// packs, so a single bad edit can break a dozen films at once. This gate catches
// the failures that are invisible until a 4-minute render finishes:
//   * the generated GSAP script must parse (a syntax error renders a blank film)
//   * no "NaN"/"undefined" leaking into markup (a bad number kills a layout)
//   * no infinite repeats (repeat:-1 makes a seeked frame non-deterministic)
//   * every scene clip present, on its own track, with a hard kill at its end
//   * the LAST clip's window must extend past the timeline end, or the final
//     frame renders black
//   * the caption node and a registered window.__timelines["vid"] must exist
//
// Offline and fast — no renders, no network, no LLM.

const fs = require("node:fs");
const path = require("node:path");
const frameRegistry = require("../src/services/frame_registry");
const frameManifest = require("../src/services/frame_manifest");

// Same renderer → composer routing as pipeline.js PACK_RENDERERS.
const COMPOSERS = {
  "three-flagship": "flagship_composer",
  "three-brightlife": "brightlife_composer",
  "blueprint": "blueprint_composer",
  "bloom-fable": "bloom_composer",
  "bauhaus-riot": "bauhaus_composer",
  "genesis": "genesis_composer",
  "momentum": "momentum_composer",
  "showcase": "showcase_composer",
  // Bundled-template packs render the ORIGINAL template via the adapter.
  "omelette": "omelette_adapter",
  "poster-loud": "family_poster",
  "retro-terminal": "family_terminal",
  "editorial-quiet": "family_editorial",
  "story-handmade": "family_story",
  "bright-minimal": "family_bright",
  "cinema": "family_cinema",
  "dark-premium": "family_darkpremium",
  "charged": "family_charged",
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
const assets = [
  { path: "a/shot.png", source: "website", kind: "screenshot", width: 2000, height: 1250, ratio: 1.6, alt: "product dashboard", sourceUrl: "https://northwind.app" },
  { path: "a/phone.png", source: "website", kind: "screenshot", width: 900, height: 1900, ratio: 0.47, alt: "mobile app screen" },
  { path: "a/p1.jpg", source: "website-image", kind: "photo", width: 1600, height: 1100, ratio: 1.45, alt: "team collaborating" },
  { path: "a/p2.jpg", source: "website-image", kind: "photo", width: 1500, height: 1000, ratio: 1.5, alt: "product on desk" },
];
const captionCues = storyboard.scenes.map((s) => ({ start: s.start + 0.3, end: s.start + s.duration - 0.3, text: s.subtext || s.headline || s.quote }));

const DIMS = [{ width: 1280, height: 720, fps: 30 }, { width: 720, height: 1280, fps: 30 }];

// Composers built on template_engine.js (plus momentum, which the engine was
// extracted from) are held to the FULL contract. The older hand-written
// composers predate it — they are still built and smoke-checked here, but their
// clip/kill bookkeeping differs by design, so the structural assertions are not
// applied to them. (They DO share the final-frame-window issue; see README note.)
const STRICT = new Set(["momentum", "poster-loud", "retro-terminal", "editorial-quiet", "story-handmade", "bright-minimal", "cinema", "dark-premium", "charged", ...Object.keys({"daybreak-bakehouse":"daybreak_composer","organic-garden":"organic_composer","lantern-night":"lantern_composer","hype-wave":"hype_composer","poster-pop":"posterpop_composer","story-blocks":"storyblocks_composer","premiere-night":"premiere_composer"})]);
// The WebGL composers drive their own render loop (no single GSAP timeline) and
// name their caption node themselves; genesis likewise. They are smoke-checked
// only — building cleanly with no NaN is the assertion that applies to them.
const SMOKE_ONLY = new Set(["three-flagship", "three-brightlife", "genesis"]);

function checkHtml(html, label, sceneCount, duration, strict, smokeOnly, portrait) {
  const problems = [];
  const script = html.split("<script>").pop().split("</script>")[0];
  if (smokeOnly) {
    const m = html.replace(/base64,[A-Za-z0-9+/=]+/g, "base64,…");
    if (/\bNaN\b/.test(m)) problems.push("NaN in output");
    if (!/id="root"/.test(m)) problems.push("no #root composition element");
    return problems;
  }
  // A bundled font's base64 payload routinely contains the literal "NaN" — strip
  // every data: payload before scanning, or the gate fails on the FONT, not the code.
  const markup = html.replace(/base64,[A-Za-z0-9+/=]+/g, "base64,…");
  try { new Function(script); } catch (e) { problems.push(`generated script does not parse: ${e.message}`); }
  if (/\bNaN\b/.test(markup)) problems.push("NaN in output");
  if (/:\s*undefined/.test(markup)) problems.push("undefined value in a style/attribute");
  if (/repeat:\s*-1/.test(script)) problems.push("infinite repeat (breaks deterministic seeking)");
  if (!/window\.__timelines\s*\[\s*["']vid["']\s*\]\s*=/.test(script)) problems.push('timeline not registered as __timelines["vid"]');
  if (!/id="cap-pill"/.test(markup)) problems.push("caption node missing");

  // Scene clips are identified by their id (s1, s2, …), NOT by a track range: a
  // family may legitimately park a chrome overlay on a low track index.
  const clips = [...html.matchAll(/id="(s\d+)"[^>]*data-start="([\d.]+)"\s+data-duration="([\d.]+)"\s+data-track-index="(\d+)"/g)]
    .map((m) => ({ id: m[1], start: +m[2], dur: +m[3], track: +m[4] }));
  const sceneClips = clips.sort((a, b) => a.start - b.start);
  // Applies to EVERY clip-based composer, engine or hand-written: the last scene
  // must outlive the timeline end or the film's final frame renders black.
  const last = sceneClips[sceneClips.length - 1];
  if (last && last.start + last.dur <= duration) problems.push(`last clip ends at ${last.start + last.dur}s (timeline ${duration}s) — final frame would render black`);
  if (!strict) return problems;

  if (sceneClips.length !== sceneCount) problems.push(`expected ${sceneCount} scene clips, found ${sceneClips.length}`);
  const tracks = new Set(sceneClips.map((c) => c.track));
  if (tracks.size !== sceneClips.length) problems.push("two scenes share a track index");
  // PORTRAIT must stack. Side-by-side columns squeeze every plate under half the
  // frame width in 9:16 — a screenshot in that space is unreadable, and QA blocked
  // a shipped film for exactly this.
  if (portrait) {
    const cols = [...markup.matchAll(/grid-template-columns:\s*([^;"]+)/g)]
      .map((m) => m[1].trim())
      .filter((c) => /(\dfr\s+\d?fr|repeat\(\s*[2-9])/.test(c));
    if (cols.length) problems.push(`side-by-side columns in portrait: ${[...new Set(cols)].join(" | ")}`);
  }
  // Every non-final scene needs a hard opacity kill at its boundary.
  const kills = (script.match(/kill\("#s\d+",/g) || []).length;
  if (kills < sceneCount - 1) problems.push(`only ${kills} hard kills for ${sceneCount} scenes`);
  return problems;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const packs = frameRegistry.listPacks
  ? frameRegistry.listPacks().map((p) => (typeof p === "string" ? p : p.name))
  : fs.readdirSync(path.join(frameRegistry.FRAMES_DIR)).filter((d) => fs.existsSync(path.join(frameRegistry.FRAMES_DIR, d, "pack.json")));

let checked = 0, failed = 0, skipped = 0;
const byRenderer = {};
for (const pack of packs) {
  if (only.length && !only.includes(pack)) continue;
  let renderer = null;
  try { renderer = (frameManifest.getManifest(pack) || {}).renderer || null; } catch { /* no manifest */ }
  if (!renderer) { skipped++; continue; }
  const modName = COMPOSERS[renderer];
  if (!modName) { console.log(`  ?  ${pack}: manifest renderer "${renderer}" has no composer in this gate`); failed++; continue; }
  let mod;
  try { mod = require(`../src/services/${modName}`); }
  catch (e) { console.log(`  ✗  ${pack}: cannot load ${modName} — ${e.message}`); failed++; continue; }

  const problems = [];
  for (const dims of DIMS) {
    let built;
    try {
      built = mod.buildComposition({ storyboard, dims, framePack: pack, captionCues, assets });
    } catch (e) {
      problems.push(`${dims.width}x${dims.height}: buildComposition threw — ${e.message}`);
      continue;
    }
    for (const p of checkHtml(built.indexHtml, pack, storyboard.scenes.length, storyboard.durationSec, STRICT.has(renderer), SMOKE_ONLY.has(renderer), dims.height > dims.width)) {
      problems.push(`${dims.width}x${dims.height}: ${p}`);
    }
  }
  checked++;
  (byRenderer[renderer] = byRenderer[renderer] || []).push(pack);
  if (problems.length) {
    failed++;
    console.log(`  ✗  ${pack} (${renderer})`);
    for (const p of problems) console.log(`       ${p}`);
  } else {
    console.log(`  ✓  ${pack} (${renderer})`);
  }
}

console.log("");
for (const [renderer, list] of Object.entries(byRenderer).sort()) {
  console.log(`  ${renderer.padEnd(18)} ${list.length} pack(s)`);
}
console.log(`\n${checked} templated pack(s) checked, ${failed} failing, ${skipped} still on scene-kit.`);
const legacyPresent = Object.keys(byRenderer).filter((rk) => !STRICT.has(rk) && !SMOKE_ONLY.has(rk));
if (legacyPresent.length) {
  console.log(`\nnote: ${legacyPresent.join(", ")} predate the engine contract — they are checked for the shared essentials (parse, NaN, timeline, captions, final-frame window) but not for the engine's clip/track bookkeeping.`);
}
process.exit(failed ? 1 : 0);
