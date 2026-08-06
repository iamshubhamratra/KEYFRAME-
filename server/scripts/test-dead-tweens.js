// DEAD-TWEEN GUARD — every animated selector must match something the composition actually drew.
//
// WHY THIS EXISTS. Five template rebuilds in a row turned up the same defect, and lint, goldens,
// the ghost guard and the motion-safety guard were all green through every one of them:
//
//   orbit      `om_port_kit.buildFilm` emitted the shared HUD's progress tween for EVERY scene,
//              but `open()` only draws `.<id>-prog` when a builder passes no chrome of its own.
//              Six packs supply their own masthead -> 6 tweens per film against nothing.
//   deep       `sSurface` used a bespoke gradient backdrop but still spread `waterTweens`, so
//              ~20 tweens animated ocean classes that scene never rendered.
//   jungle     every `statement` fallback spread `{...K.statement(), backdrop: canopy()}`, which
//              drew the canopy and dropped its motion — and the animal cast with it.
//
// A dead tween is not merely wasted work. It is INDISTINGUISHABLE FROM FURNITURE THAT WAS
// AUTHORED AND THEN FAILED TO RENDER, which is exactly the class of defect this library keeps
// shipping: the code says the jellyfish drifts, the frame has no jellyfish, and nothing fails.
// The browser knows — GSAP logs "target ... not found" — but nothing was reading the console.
// This does.
//
// WHAT IT CHECKS. For every pack with a dedicated composer, at several asset counts: pull every
// GSAP target that is a LITERAL string, plus literal `document.querySelector` arguments and the
// composers' own selector-taking runtime helpers, then require each `#id` and `.class` token in
// them to appear somewhere in the emitted HTML.
//
// WHAT IT DOES NOT CHECK — stated so nobody reads more into a pass than is there:
//   * ANCESTRY. `#s1 .foo` passes when `#s1` and `.foo` both exist somewhere, even if `.foo` is
//     not inside `#s1`. Token existence is what catches the whole observed failure class; a real
//     descendant check needs a DOM, and jsdom is not a dependency here.
//   * Selectors built at runtime from variables — only literals are visible to a static scan.
//   * Tag-only compounds (`span`, `img`): no id/class to verify, and they are not the failure mode.
//
// Run: npm run test:dead-tweens

const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");

const DIMS = { width: 1080, height: 1920, fps: 30 };
const ASSETS = [
  { path: "assets/s0.png", type: "image", ratio: 0.667, width: 800, height: 1200, source: "website", kindHint: "screenshot", cdProminence: "hero", visionOk: true, cdScore: 0.92, alt: "product screenshot" },
  { path: "assets/s1.png", type: "image", ratio: 1.78, width: 1600, height: 900, source: "upload", kindHint: "screenshot", cdProminence: "support", cdScore: 0.85, alt: "dashboard" },
  { path: "assets/s2.png", type: "image", ratio: 1.4, width: 1400, height: 1000, source: "website-asset", kindHint: "photo", cdProminence: "support", visionOk: true, cdScore: 0.7, alt: "brand image" },
  { path: "assets/s3.png", type: "image", ratio: 1.0, width: 1200, height: 1200, source: "upload", kindHint: "photo", cdProminence: "support", cdScore: 0.66, alt: "team" },
  { path: "assets/s4.png", type: "image", ratio: 1.78, width: 1920, height: 1080, source: "website", kindHint: "screenshot", cdProminence: "support", visionOk: true, cdScore: 0.6, alt: "wide" },
  { path: "assets/logo.png", type: "image", width: 400, height: 400, source: "website-brand", role: "logo", alt: "logo" },
];
const SB = { title: "Acme", durationSec: 22, scenes: [
  { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "intro", headline: "Ship faster with Acme", subtext: "The developer cloud." },
  { id: "s2", start: 4, duration: 4, kind: "feature", purpose: "feature", headline: "One dashboard for everything", subtext: "Everything that matters.", onScreenText: ["Deploys", "Metrics", "Logs"] },
  { id: "s3", start: 8, duration: 4, kind: "quote", purpose: "testimonial", headline: "The best tool we use", subtext: "CTO, Acme" },
  { id: "s4", start: 12, duration: 3.5, kind: "stat", purpose: "result", headline: "Deploy in 8 seconds and ship 40% more", emphasis: "8s", subtext: "99.9% uptime, 12ms latency." },
  { id: "s5", start: 15.5, duration: 3.5, kind: "feature", purpose: "feature", headline: "Every screen, one glance", subtext: "Built for the team." },
  { id: "s6", start: 19, duration: 3, kind: "cta", purpose: "cta", headline: "Acme Cloud", emphasis: "Start free", subtext: "acme.dev" },
] };
// 0 assets is the important one: it is the pictureless path, where every `statement` fallback
// lives, and where jungle's canopy motion went missing.
const COUNTS = [0, 1, 2, 4, 6];

// EXEMPTIONS — a deliberate, already-argued trade-off, not an oversight. Anything not listed here
// is a defect. Keep the reason with the entry: an exemption without one becomes a licence.
const EXEMPT = [
  // The burned-in caption node is emitted ONLY when the film has cues, and these fixtures pass
  // none. A composer that tints or moves the caption therefore targets a node that legitimately
  // does not exist in a caption-free build — and DOES exist in every real narrated film. Scoped
  // to the two caption ids so it cannot hide anything else.
  { re: /^#(?:cap-text|cap-pill)$/, why: "caption node only exists when the film has cues; fixtures pass none" },
];

// Every id and class token the document actually contains.
function tokenIndex(html) {
  const ids = new Set(), classes = new Set();
  for (const m of html.matchAll(/\sid\s*=\s*"([^"]*)"/g)) if (m[1].trim()) ids.add(m[1].trim());
  for (const m of html.matchAll(/\sclass\s*=\s*"([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  }
  // SVG presentation attributes can carry a class too, and `className` never appears in emitted
  // markup — but a composer building markup by hand can still write `class='x'` with single
  // quotes, so both quote styles are read.
  for (const m of html.matchAll(/\sclass\s*=\s*'([^']*)'/g)) {
    for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  }
  for (const m of html.matchAll(/\sid\s*=\s*'([^']*)'/g)) if (m[1].trim()) ids.add(m[1].trim());
  return { ids, classes };
}

// Reduce a selector to the id/class tokens it REQUIRES. Returns [] for anything unverifiable
// (tag-only, attribute-only, pseudo) so those never produce a false failure.
function requiredTokens(sel) {
  const out = [];
  for (const one of String(sel).split(",")) {
    let s = one.trim();
    if (!s) continue;
    // Strip pseudo-classes/elements and attribute selectors — not verifiable by token presence.
    s = s.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, " ").replace(/\[[^\]]*\]/g, " ");
    for (const part of s.split(/[\s>+~]+/)) {
      if (!part) continue;
      for (const m of part.matchAll(/([#.])([A-Za-z0-9_-]+)/g)) {
        out.push({ kind: m[1] === "#" ? "id" : "class", name: m[2], sel: one.trim() });
      }
    }
  }
  return out;
}

// Every animated / queried selector in the composition's own scripts.
function selectorsIn(script) {
  const out = new Set();
  const push = (raw) => { if (raw) out.add(raw); };
  // GSAP timeline + global calls with a literal first argument.
  for (const m of script.matchAll(/(?:tl|gsap)\s*\.\s*(?:to|from|fromTo|set|killTweensOf)\(\s*(["'])([^"']+)\1/g)) push(m[2]);
  // The composers' own runtime helpers that take a selector: `kill(sel, t)` (om_port_kit) and
  // `burst(sel, at, dur)` (transition_kit's RUNTIME_HELPERS).
  for (const m of script.matchAll(/\b(?:kill|burst)\(\s*(["'])([^"']+)\1/g)) push(m[2]);
  // Direct DOM reads — the innerText counters resolve their own node this way, and a wrong class
  // there silently leaves the figure at 0 rather than counting up.
  for (const m of script.matchAll(/querySelector(?:All)?\(\s*(["'])([^"']+)\1/g)) push(m[2]);
  return [...out];
}

const packs = frameRegistry.listPacks().filter((p) => composerModuleFor((fm.getManifest(p) || {}).renderer));
let failed = 0, checked = 0, exemptedTotal = 0;

console.log(`\nDEAD-TWEEN GUARD — ${packs.length} pack(s) with a dedicated composer x ${COUNTS.length} asset count(s)\n`);

for (const pack of packs) {
  const comp = composerModuleFor((fm.getManifest(pack) || {}).renderer);
  const manifest = fm.getManifest(pack) || {};
  const portrait = String(manifest.orientation || "").toLowerCase() === "portrait";
  const dims = portrait ? DIMS : { width: 1920, height: 1080, fps: 30 };
  const misses = new Map();   // "selector → missing token" -> count of asset-counts it appeared at
  let exempted = 0;

  for (const n of COUNTS) {
    let built;
    try {
      built = comp.buildComposition({
        storyboard: JSON.parse(JSON.stringify(SB)), dims, framePack: pack,
        assets: ASSETS.slice(0, n), captionCues: [], brandSkin: null, seedKey: `dead-${pack}-${n}`,
      });
    } catch (e) {
      console.log(`  ✗ ${pack}: buildComposition threw at ${n} asset(s) — ${String(e.message).slice(0, 120)}`);
      failed++; misses.set("__threw", 1); break;
    }
    if (!built || !built.indexHtml) continue;
    checked++;
    const html = built.indexHtml;
    const { ids, classes } = tokenIndex(html);
    const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

    for (const sel of selectorsIn(script)) {
      for (const tok of requiredTokens(sel)) {
        const present = tok.kind === "id" ? ids.has(tok.name) : classes.has(tok.name);
        if (present) continue;
        const key = `${tok.sel}  (no ${tok.kind === "id" ? "#" : "."}${tok.name})`;
        const ex = EXEMPT.find((e) => e.re.test(tok.sel));
        if (ex) { exempted++; continue; }
        misses.set(key, (misses.get(key) || 0) + 1);
      }
    }
  }

  exemptedTotal += exempted;
  if (misses.has("__threw")) continue;
  const list = [...misses.keys()];
  if (list.length) {
    failed++;
    console.log(`  ✗ ${pack}: animates ${list.length} selector(s) it never draws`);
    for (const k of list.slice(0, 6)) console.log(`      ${k}`);
    if (list.length > 6) console.log(`      (+${list.length - 6} more)`);
  } else {
    console.log(`  ✓ ${pack}: every animated selector is drawn${exempted ? `  (${exempted} documented exemption(s))` : ""}`);
  }
}

console.log(`\n${packs.length - failed} passed, ${failed} failed  (${checked} composition(s) inspected${exemptedTotal ? `, ${exemptedTotal} documented exemption(s)` : ""})`);
process.exit(failed ? 1 : 0);
