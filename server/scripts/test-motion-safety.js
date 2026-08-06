// MOTION SAFETY — no composer may animate a LAYOUT property.
//
// `left`, `top`, `width`, `height`, `margin`, `padding`, `font-size` and friends snap to integer
// device pixels during browser layout, and GSAP's roundProps rounds the tween value on top. Under
// the renderer's seek-by-frame capture engine a slow move or an ease-out tail then visibly
// stutters — the same motion done with `x`/`y`/`scale` interpolates sub-pixel and stays smooth.
// It is also far more expensive: a layout property re-flows a 1080×1920 Chromium page every frame.
//
// `hyperframes lint` has this rule (`gsap_non_transform_motion`), but lint only ever runs against
// a BUILT job directory, which means it runs on whatever a developer happens to build by hand.
// ai-laboratory shipped with up to 49 of these per composition and nothing in `npm test` saw it:
// its signal dots flew along their wires on `left`/`top`, and its CTA trail converged the same
// way. Found by sweeping every pack through lint once, by hand. This is that sweep, made cheap
// enough to run every time.
const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");

const DIMS = { width: 1080, height: 1920, fps: 30 };
const ASSETS = [
  { path: "assets/s0.png", type: "image", ratio: 0.667, width: 800, height: 1200, source: "website", kindHint: "screenshot", cdProminence: "hero", visionOk: true, cdScore: 0.92, alt: "product screenshot" },
  { path: "assets/s1.png", type: "image", ratio: 1.78, width: 1600, height: 900, source: "upload", kindHint: "screenshot", cdProminence: "support", cdScore: 0.85, alt: "dashboard" },
  { path: "assets/s2.png", type: "image", ratio: 1.4, width: 1400, height: 1000, source: "website-asset", kindHint: "photo", cdProminence: "support", visionOk: true, cdScore: 0.7, alt: "brand image" },
  { path: "assets/logo.png", type: "image", width: 400, height: 400, source: "website-brand", role: "logo", alt: "logo" },
];
const SB = { title: "Acme", durationSec: 22, scenes: [
  { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "intro", headline: "Ship faster with Acme", subtext: "The developer cloud." },
  { id: "s2", start: 4, duration: 4, kind: "feature", purpose: "feature", headline: "One dashboard for everything", subtext: "Everything that matters.", onScreenText: ["Deploys", "Metrics", "Logs"] },
  { id: "s3", start: 8, duration: 4, kind: "quote", purpose: "testimonial", headline: "The best tool we use", subtext: "CTO, Acme" },
  { id: "s4", start: 12, duration: 3.5, kind: "stat", purpose: "result", headline: "Deploy in 8 seconds", emphasis: "8s", subtext: "99.9% uptime." },
  { id: "s5", start: 15.5, duration: 3.5, kind: "feature", purpose: "feature", headline: "Every screen, one glance", subtext: "Built for the team." },
  { id: "s6", start: 19, duration: 3, kind: "cta", purpose: "cta", headline: "Acme Cloud", emphasis: "Start free", subtext: "acme.dev" },
] };
const COUNTS = [0, 2, 4];

// EXEMPTIONS — a deliberate, already-argued trade-off, not an oversight. Anything not listed here
// is a defect. Keep the reason with the entry: an exemption without one becomes a licence.
const EXEMPT = {
  // slab-stage's karaoke band sets the live word at full size and every other at half, and the
  // LINE RE-WRAPS around whichever word is live — that reflow IS the look. The port tried `scale`
  // first and it was structurally wrong: a transform does not change the layout box, so every
  // word kept its full-size footprint and the band rendered as scattered type with holes where
  // the shrunken words used to be. See the comment above `karSize` in slab_stage_composer.js.
  // The moves are short (0.3s / 0.26s), which is the far end of the rule's stutter risk.
  "slab-stage": /^\.s\d+-w\d+ → fontSize$/,
};

// Exactly the set `hyperframes lint` rejects — calibrated against it, not guessed. `width` and
// `height` are deliberately NOT here: the renderer tolerates them (a rule that grows, a panel
// that opens), and a guard stricter than the toolchain it protects only teaches people to
// ignore it. `x`/`y`/`scale`/`rotation`/`opacity`/`filter`/`clipPath` are always fine.
const LAYOUT = /\b(?:left|top|right|bottom|margin(?:Left|Right|Top|Bottom)?|padding(?:Left|Right|Top|Bottom)?|fontSize|lineHeight|letterSpacing)\s*:/;

// A tween's vars objects only — never its POSITION argument or its selector, and never a value.
// `tl.to(sel,{...},AT)` / `tl.fromTo(sel,{...},{...},AT)`.
function varsObjects(call) {
  const out = [];
  let depth = 0, start = -1;
  for (let i = 0; i < call.length; i++) {
    if (call[i] === "{") { if (depth++ === 0) start = i; }
    else if (call[i] === "}") { if (--depth === 0 && start >= 0) { out.push(call.slice(start, i + 1)); start = -1; } }
  }
  return out;
}

const packs = frameRegistry.listPacks().filter((p) => composerModuleFor((fm.getManifest(p) || {}).renderer));
let failed = 0, checked = 0;

for (const pack of packs) {
  const comp = composerModuleFor((fm.getManifest(pack) || {}).renderer);
  const hits = new Set();
  for (const n of COUNTS) {
    let html;
    try {
      html = comp.buildComposition({
        storyboard: JSON.parse(JSON.stringify(SB)), dims: DIMS, framePack: pack,
        captionCues: [], assets: ASSETS.slice(0, n).concat(ASSETS[ASSETS.length - 1]), brandSkin: null,
      }).indexHtml;
    } catch { continue; }
    checked++;
    const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

    // NOT CHECKED HERE: `gsap_css_transform_conflict` (an inline `transform:` on an element GSAP
    // tweens a transform channel on). It is a real and worse defect — product-showcase and
    // retro-future both shipped `translate(-50%,-50%)` centring under a `y` tween, so those
    // frames jumped half their own size the instant they started moving — but the renderer's
    // rule is channel-aware in a way a static scan here is not: inline `transform:scaleX(0)`
    // under a `scaleX` tween is the correct, universal idiom for a progress rule and must stay
    // legal. A first cut of this check flagged 27 packs that all lint clean. Leave it to lint.
    // `set` is exempt: an instantaneous set never interpolates, so it cannot stutter.
    for (const m of script.matchAll(/(?:tl|gsap)\.(?:to|fromTo)\(\s*(["'][^"']+["'])([\s\S]{0,700}?)\)\s*;/g)) {
      for (const vars of varsObjects(m[2])) {
        const bad = vars.match(LAYOUT);
        if (bad) hits.add(`${m[1].slice(1, -1)} → ${bad[0].replace(/\s*:$/, "")}`);
      }
    }
  }
  const allow = EXEMPT[pack];
  const exempted = allow ? [...hits].filter((h) => allow.test(h)).length : 0;
  const real = [...hits].filter((h) => !(allow && allow.test(h)));
  if (real.length) {
    failed++;
    console.log(`  ✗ ${pack}: animates layout properties — ${real.slice(0, 4).join(", ")}${real.length > 4 ? ` (+${real.length - 4} more)` : ""}`);
  } else {
    console.log(`  ✓ ${pack}: motion stays on transform/opacity/filter${exempted ? `  (${exempted} documented exemption(s))` : ""}`);
  }
}

console.log(`\n${packs.length - failed} passed, ${failed} failed  (${checked} composition(s) inspected)`);
process.exit(failed ? 1 : 0);
