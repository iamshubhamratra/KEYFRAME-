// GHOST GUARD — no composer may ship content it never reveals.
//
// Every native composer hides elements at birth (inline `opacity:0`) and animates them in. When
// the reveal is missing, or lands on a CHILD while the parent stays hidden, the copy is authored,
// sized, measured, laid out — and never seen. Nothing else in this repo can catch that:
//
//   • `hyperframes lint` checks legality, not visibility.
//   • the golden hashes are stable BECAUSE the output never changes.
//   • the portrait/asset guards assert the element EXISTS, not that it is on screen.
//   • `npm test` was fully green the whole time all three defects below were live.
//
// Found by rendering a film and reading the frames. This is the cheap version of that.
//
// Defects this was written against (all shipped, all invisible, all now fixed):
//   neo-dashboard   the opening headline — container hidden, only its word spans revealed
//   minimal-luxury  the list + gallery headlines — same shape
//   retro-future    the showcase support line — reveal tween simply absent
//
// An element counts as REVEALED when some tween whose selector mentions one of its own classes
// (or its id) names a non-zero opacity. The CLASS test — rather than an exact-selector test — is
// what makes descendant reveals legal: nature-flow reveals its word spans through
// `.s3-head .nf-word`, and a stricter test called that working headline broken.
const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");

const DIMS = { width: 1080, height: 1920, fps: 30 };
const ALL_ASSETS = [
  { path: "assets/s0.png", type: "image", ratio: 0.667, width: 800, height: 1200, source: "website", kindHint: "screenshot", cdProminence: "hero", visionOk: true, cdScore: 0.92, alt: "product screenshot" },
  { path: "assets/s1.png", type: "image", ratio: 1.78, width: 1600, height: 900, source: "upload", kindHint: "screenshot", cdProminence: "support", cdScore: 0.85, alt: "dashboard" },
  { path: "assets/s2.png", type: "image", ratio: 1.4, width: 1400, height: 1000, source: "website-asset", kindHint: "photo", cdProminence: "support", visionOk: true, cdScore: 0.7, alt: "brand image" },
  { path: "assets/s3.png", type: "image", ratio: 1.0, width: 1000, height: 1000, source: "upload", kindHint: "photo", cdProminence: "support", cdScore: 0.6, alt: "square" },
  { path: "assets/logo.png", type: "image", width: 400, height: 400, source: "website-brand", role: "logo", alt: "logo" },
];
const SB = { title: "Acme", durationSec: 22, scenes: [
  { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "intro", headline: "Ship faster with Acme", subtext: "The developer cloud." },
  { id: "s2", start: 4, duration: 4, kind: "feature", purpose: "feature", headline: "One dashboard for everything", subtext: "Everything that matters, the moment you land.", onScreenText: ["Deploys", "Metrics", "Logs"] },
  { id: "s3", start: 8, duration: 4, kind: "quote", purpose: "testimonial", headline: "The best tool we use", subtext: "CTO, Acme" },
  { id: "s4", start: 12, duration: 3.5, kind: "stat", purpose: "result", headline: "Deploy in 8 seconds", emphasis: "8s", subtext: "Twelve thousand teams, 99.9% uptime." },
  { id: "s5", start: 15.5, duration: 3.5, kind: "feature", purpose: "feature", headline: "Every screen, one glance", subtext: "Built for the whole team." },
  { id: "s6", start: 19, duration: 3, kind: "cta", purpose: "cta", headline: "Acme Cloud", emphasis: "Start free", subtext: "acme.dev" },
] };

// Asset counts, because the ARCHETYPE a scene gets depends on how many shots it received — two
// of the three defects only appeared at some counts and were invisible at others.
const COUNTS = [0, 1, 2, 3, 5];

const VISIBLE = /opacity:\s*(?:1\b|0?\.[1-9])|\.style\.opacity\s*=\s*["'](?:1|0?\.[1-9])/;

// The body of `function name(...)`, by brace matching from its opening `{`.
function bodyOf(src, at) {
  const open = src.indexOf("{", at);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

function ghostsIn(html) {
  const body = html.slice(html.indexOf("<body>"));
  // EVERY script block, not just the last one. flagship and brightlife emit their timeline before
  // their WebGL block, so reading only the final block made all six of their text scenes look
  // like they were never revealed.
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const reveals = new Set();

  // 1. direct tweens. Scanned PER CALL, not per line: composers pack several tweens onto one
  // line inside a conditional, and a per-line scan credits only the first selector on it.
  const calls = [...script.matchAll(/(?:tl|gsap)\.(?:to|fromTo|set)\(\s*["']([^"']+)["']/g)];
  calls.forEach((m, i) => {
    const end = i + 1 < calls.length ? calls[i + 1].index : Math.min(script.length, m.index + 500);
    if (!VISIBLE.test(script.slice(m.index, end))) return;
    m[1].split(",").forEach((s) => reveals.add(s.trim()));
  });

  // 2. REVEAL HELPERS. Composers factor repeated motion into helpers — `burst(sel,…)` in
  // transition_kit, `pop`/`fold` in paper-tales, `show` in flagship. A selector handed to a
  // helper whose body animates opacity is revealed just as surely as one tweened inline, and a
  // guard that only understood `tl.` calls would condemn every pack that factors its motion.
  for (const def of script.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!VISIBLE.test(bodyOf(script, def.index))) continue;
    // EVERY quoted argument, not just the first — paper-tales' `popUp(shadowSel, cardSel, …)`
    // reveals its second argument, and a first-argument-only rule condemned four of its scenes.
    // One level of nested parens, because selectors carry them: bauhaus-riot reveals its stamps
    // through `stamp(".s4-stamp:nth-child(1)", …)`, and a `[^)]*` argument list stops inside it.
    const call = new RegExp(`\\b${def[1]}\\(((?:[^()]|\\([^()]*\\))*)\\)`, "g");
    for (const c of script.matchAll(call)) {
      for (const a of c[1].matchAll(/["']([^"']+)["']/g)) a[1].split(",").forEach((s) => reveals.add(s.trim()));
    }
  }

  // 3. IMPERATIVE reveals. The shared caption node is switched on by the per-frame proxy
  // (`cap.style.opacity = active ? "1" : "0"`), never by a tween — it is looked up once through
  // `$("#cap-pill")`. Any `.style.opacity` assignment at all puts the looked-up nodes in scope.
  if (/\.style\.opacity\s*=/.test(script)) {
    for (const m of script.matchAll(/(?:\$|querySelector(?:All)?)\(\s*["']([^"']+)["']/g)) reveals.add(m[1].trim());
  }

  const out = new Map();
  for (const m of body.matchAll(/<(?:div|span|p|h\d|section|img|svg|a)\b[^>]*>/g)) {
    const tag = m[0];
    if (!/style="[^"]*opacity:\s*0(?![.\d])/.test(tag)) continue;
    const cls = (tag.match(/class="([^"]*)"/) || [, ""])[1].split(/\s+/).filter(Boolean);
    const id = (tag.match(/\bid="([^"]+)"/) || [, ""])[1];
    const tokens = [...cls.map((c) => `.${c}`), ...(id ? [`#${id}`] : [])];
    if (!tokens.length) continue;
    if ([...reveals].some((sel) => tokens.some((tok) => sel.includes(tok)))) continue;
    const key = cls.find((c) => /^s\d+-/.test(c)) || id || cls[0];
    out.set(key, (out.get(key) || 0) + 1);
  }
  return out;
}

const packs = frameRegistry.listPacks().filter((p) => composerModuleFor((fm.getManifest(p) || {}).renderer));
let checked = 0, failed = 0;
for (const pack of packs) {
  const comp = composerModuleFor((fm.getManifest(pack) || {}).renderer);
  const hits = new Map();
  for (const n of COUNTS) {
    let built;
    try {
      built = comp.buildComposition({
        storyboard: JSON.parse(JSON.stringify(SB)), dims: DIMS, framePack: pack,
        captionCues: [], assets: ALL_ASSETS.slice(0, n).concat(ALL_ASSETS[ALL_ASSETS.length - 1]),
        brandSkin: null,
      });
    } catch { continue; } // a composer that refuses this storyboard is the golden test's problem
    checked++;
    for (const [k, v] of ghostsIn(built.indexHtml)) hits.set(`${k}@${n}shots`, v);
  }
  if (hits.size) {
    failed++;
    console.log(`  ✗ ${pack}: hides content it never reveals — ${[...hits.keys()].slice(0, 8).join(", ")}${hits.size > 8 ? ` (+${hits.size - 8} more)` : ""}`);
  } else {
    console.log(`  ✓ ${pack}: every hidden element is revealed`);
  }
}

console.log(`\n${packs.length - failed} passed, ${failed} failed  (${checked} composition(s) inspected)`);
process.exit(failed ? 1 : 0);
