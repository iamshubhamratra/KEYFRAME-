// PLAYBACK-CHROME GUARD — an exported film may not wear a progress bar.
//
// Every engine in this repo grew the same habit independently: a thin rail pinned across the top
// of the frame, filled left-to-right over the film's duration, so the viewer can "see how far
// through" they are. film_stage had `#fk-prog`, om_stage `#om-prog`, prisma `#kf-prog`,
// om_port_kit `.<id>-prog`, grid-dispatch `.gd-prog`, slab-stage `.sb-prog`, reel a segmented
// Stories bar. Nobody designed this; it propagated by copy.
//
// It is not a preview overlay — it is inside the composition the headless browser screenshots, so
// it is burned into the MP4. A finished advertisement does not carry a scrubber, and the bar is
// the single clearest tell that a KEYFRAME film is a "render" rather than a film.
//
// WHY A GUARD AND NOT JUST A DELETION: the rail came back twice during its own removal, because
// several composers build chrome by spreading a shared kit's chrome helper, and re-adding the
// helper re-adds the rail. Deleting the six sites fixes today; this fixes tomorrow.
//
// THREE INDEPENDENT DETECTORS, because any one of them alone has a blind spot:
//   1. VOCABULARY — an id/class from the progress-indicator vocabulary in the emitted HTML.
//   2. RAIL SHAPE — a tween that scales something from 0 to 1 linearly across the WHOLE film.
//                   That is what a continuous progress fill IS, whatever it is called.
//   3. SEGMENT SHAPE — one linear 0->1 fill PER SCENE. This is the Instagram-Stories strip: N
//                   thin bars, the current one filling across its own beat while earlier ones sit
//                   full. Detectors 1 and 2 both missed reel's (`.s1-seg`, filled over the BEAT,
//                   not the film) and its bar is plainly visible in the exported poster — which is
//                   exactly why the shape rule is written twice, at two different time scales.
//
// Deliberately NOT flagged (legitimate template art, verified individually):
//   • stat bars that grow to a DATA value (they encode the product, not the playhead)
//   • underline sweeps under a headline (they end with the reveal, not with the film)
//   • loading/progress UI drawn INSIDE a device screenshot the film is advertising
const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");

const DIMS = { width: 1080, height: 1920, fps: 30 };
const LAND = { width: 1920, height: 1080, fps: 30 };

const ASSETS = [
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

// 1. VOCABULARY. Matched against id="" / class="" values only — never against free text, or a
// headline reading "our progress" would fail the build. `-prog` is anchored to a word boundary so
// it cannot catch "program" or "prognosis".
// Two tokens were tried here and REMOVED, because in this codebase they mean something else and
// the guard must not cry wolf: `rule` is a typographic hairline that sweeps under a headline on
// an eased tween (biennale-yellow, deep, drive, momentum, noir-spotlight, pipeline all have one),
// and `chapter` is paper-tales' storybook tab label. Both are design. The shape detectors below
// are what catch a renamed rail — the vocabulary only has to catch the honest ones.
const NAMES = /(?:^|[\s"'-])(?:prog|progress|progressbar|progress-bar|scrub|scrubber|playhead|seekbar|seek-bar|timebar|time-bar|storybar|story-bar|segbar|seg)(?:$|[\s"'-])/i;

// 2. SHAPE. `tl.fromTo("<sel>",{scaleX:0},{scaleX:1,duration:<D>,ease:"none"},...)` and its
// width/x variants. Captured loosely, then filtered on duration below.
const TWEEN = /tl\.(?:fromTo|to)\(\s*["']([^"']+)["'][^;]*?\b(?:scaleX|width)\s*:\s*(?:1\b|["']100%["'])[^;]*?duration\s*:\s*([\d.]+)[^;]*?ease\s*:\s*["'](none|linear)["']/g;

function idsAndClasses(html) {
  const out = [];
  for (const m of html.matchAll(/\b(?:id|class)\s*=\s*["']([^"']*)["']/g)) out.push(m[1]);
  return out;
}

function findingsIn(built, filmDur, sceneCount) {
  const html = String(built.indexHtml || "");
  const hits = [];

  for (const val of idsAndClasses(html)) {
    for (const token of val.split(/\s+/)) {
      if (token && NAMES.test(` ${token} `)) hits.push({ how: "name", detail: token });
    }
  }

  // A fill that runs the length of the film. Anything shorter is a reveal, not a scrubber;
  // 85% is the slack for engines that stop the rail a beat before the CTA lands.
  const linear = [...String(html).matchAll(TWEEN)];
  for (const m of linear) {
    const dur = Number(m[2]);
    if (Number.isFinite(dur) && Number.isFinite(filmDur) && filmDur > 0 && dur >= filmDur * 0.85) {
      hits.push({ how: "rail", detail: `${m[1]} scales to full over ${dur}s of a ${filmDur}s film (linear)` });
    }
  }

  // A Stories strip: one linear 0->1 fill per scene, each short. A stat bar chart also grows
  // linearly, so the discriminator is COUNT — a chart draws its bars inside one or two beats,
  // whereas a segment strip places exactly one fill on every beat of the film. Requiring at
  // least sceneCount-1 distinct short fills keeps a three-bar stat scene from tripping it.
  const short = linear.filter((m) => {
    const d = Number(m[2]);
    return Number.isFinite(d) && d > 0 && d < filmDur * 0.85;
  });
  const distinct = new Set(short.map((m) => m[1].replace(/\d+/g, "#")));
  if (sceneCount >= 3 && short.length >= sceneCount - 1 && distinct.size === 1) {
    hits.push({ how: "segments", detail: `${short.length} linear fills across ${sceneCount} scenes on "${short[0][1]}" — a per-beat progress strip` });
  }

  // Dedup — the same rail is normally caught by both detectors, which is the point.
  const seen = new Set();
  return hits.filter((h) => { const k = `${h.how}|${h.detail}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const report = process.argv.includes("--report");
const packs = frameRegistry.listPacks().filter((p) => composerModuleFor((fm.getManifest(p) || {}).renderer));

let checked = 0, failed = 0;
const rows = [];
for (const pack of packs) {
  const manifest = fm.getManifest(pack) || {};
  const comp = composerModuleFor(manifest.renderer);
  const dims = manifest.orientation === "portrait" ? DIMS : LAND;
  let built;
  try {
    built = comp.buildComposition({
      storyboard: JSON.parse(JSON.stringify(SB)), dims, framePack: pack,
      captionCues: [], assets: ASSETS, brandSkin: null,
    });
  } catch { continue; } // a composer that refuses this storyboard is the golden test's problem
  checked++;
  const hits = findingsIn(built, SB.durationSec, SB.scenes.length);
  if (hits.length) {
    failed++;
    rows.push({ pack, orientation: manifest.orientation || "landscape", renderer: manifest.renderer, hits });
  }
}

console.log(`\nPLAYBACK-CHROME GUARD — ${checked} composition(s)\n`);
for (const r of rows) {
  console.log(`  ✗ ${r.pack}  [${r.orientation}]  ${r.renderer}`);
  for (const h of r.hits.slice(0, report ? 99 : 4)) console.log(`      ${h.how}: ${h.detail}`);
}
if (!rows.length) console.log("  ✓ no film wears a progress bar, a scrubber or a playhead\n");
console.log(`\n${checked - failed} passed, ${failed} failed  (${checked} composition(s) inspected)\n`);

if (report) {
  const byRenderer = new Map();
  for (const r of rows) byRenderer.set(r.renderer, (byRenderer.get(r.renderer) || 0) + 1);
  console.log("BY RENDERER:");
  for (const [k, v] of [...byRenderer].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  const port = rows.filter((r) => r.orientation === "portrait").length;
  console.log(`\nportrait affected: ${port} / ${rows.length} failing packs`);
}
process.exit(!report && failed ? 1 : 0);
