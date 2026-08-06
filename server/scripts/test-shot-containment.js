// SHOT-CONTAINMENT GUARD — a screenshot must fill its frame, not escape it.
//
// WHY THIS EXISTS. `K.shotFill` emits `position:absolute;inset:0`. That is only "fill my wrapper" if
// the wrapper is a POSITIONED ancestor; when it is not, the image resolves against whatever
// positioned element is further up — normally the whole device card — and paints straight over the
// furniture that makes the device a device.
//
// Found by eye in two packs on the same day:
//   drive     — browser body and phone screen both unpositioned: every browser in the film lost its
//               traffic-light dots and its url bar, every phone lost its bezel and kept only the
//               notch (which survived because it carries z-index).
//   momentum  — the identical pair, identical symptom.
//
// NOTHING ELSE COULD SEE IT. The markup is all present, so `test-ghosts` passes. The CSS is all
// valid, so `test-dropped-css` passes. Every tween has its target, so `test-dead-tweens` passes. The
// golden hash is of the HTML string, which never changed. It is a containing-block bug: it exists
// only in layout, and only the browser knows.
//
// HOW IT DETECTS. For every image `shotFill` emitted, compare its box with its OWN parent's box. An
// absolutely-positioned `inset:0` child of a positioned parent lands exactly on that parent's
// padding box. If the two boxes disagree by more than a rounding error, the image is being laid out
// against something else — which is the bug, precisely and with no heuristics.
//
// A LEGITIMATE inset:0 image inside a padded parent would also differ, so the check allows the
// parent's own padding: what it forbids is an image that reaches OUTSIDE its parent's border box.
//
// Run: npm run test:shot-containment

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");
const { findChromium } = require("./shot-reference");

const WORK = path.join(__dirname, "..", "jobs", "_shotfit");
const ASSETS = [
  { path: "a0.svg", type: "image", ratio: 1.78, width: 1600, height: 900, source: "website", kindHint: "screenshot", cdProminence: "hero", visionOk: true, cdScore: 0.92, alt: "shot" },
  { path: "a1.svg", type: "image", ratio: 0.8, width: 1000, height: 1250, source: "upload", kindHint: "screenshot", cdProminence: "support", cdScore: 0.8, alt: "mobile" },
  { path: "a2.svg", type: "image", ratio: 1.4, width: 1400, height: 1000, source: "website-asset", kindHint: "photo", cdProminence: "support", visionOk: true, cdScore: 0.7, alt: "photo" },
  { path: "a3.svg", type: "image", ratio: 1.0, width: 1200, height: 1200, source: "upload", kindHint: "photo", cdProminence: "support", cdScore: 0.66, alt: "square" },
  { path: "a4.svg", type: "image", ratio: 0.75, width: 900, height: 1200, source: "upload", kindHint: "screenshot", cdProminence: "support", cdScore: 0.64, alt: "phone" },
  { path: "a5.svg", type: "image", ratio: 1.6, width: 1600, height: 1000, source: "website", kindHint: "screenshot", cdProminence: "support", visionOk: true, cdScore: 0.6, alt: "wide" },
  { path: "logo.svg", type: "image", width: 400, height: 400, source: "website-brand", role: "logo", alt: "logo" },
];
// EIGHT SCENES AND SIX PICTURES, DELIBERATELY. The first fixture had six scenes and five assets,
// and momentum never drew a phone under it at all — so the guard's own calibration could not fire.
// A pack's device-heavy beats only appear when the film is long enough to reach them, which means a
// fixture that under-feeds the spine silently under-tests every pack in the library.
const SB = { title: "Acme", durationSec: 33, scenes: [
  { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "intro", headline: "Ship faster with Acme", subtext: "The developer cloud." },
  { id: "s2", start: 4, duration: 4, kind: "feature", purpose: "feature", headline: "One dashboard for everything", subtext: "Everything that matters.", onScreenText: ["Deploys", "Metrics", "Logs"] },
  { id: "s3", start: 8, duration: 4, kind: "feature", purpose: "feature", headline: "In your pocket", subtext: "Every screen, one app.", onScreenText: ["Offline-first", "Push sync", "Face ID"] },
  { id: "s4", start: 12, duration: 4, kind: "quote", purpose: "testimonial", headline: "The best tool we use", subtext: "CTO, Acme" },
  { id: "s5", start: 16, duration: 4, kind: "stat", purpose: "result", headline: "Deploy in 8 seconds", emphasis: "8s", subtext: "99.9% uptime, 12ms latency." },
  { id: "s6", start: 20, duration: 4, kind: "feature", purpose: "feature", headline: "Every screen, one glance", subtext: "Built for the team." },
  { id: "s7", start: 24, duration: 4, kind: "feature", purpose: "gallery", headline: "The whole surface", subtext: "Board, timeline, docs." },
  { id: "s8", start: 28, duration: 5, kind: "cta", purpose: "cta", headline: "Acme Cloud", emphasis: "Start free", subtext: "acme.dev" },
] };

// EXEMPTIONS — keep the reason with the entry. A full-bleed backdrop image is SUPPOSED to escape a
// plain wrapper and cover the stage; that is the pack's ground, not a device.
const EXEMPT = [];

// Twelve evenly spaced probes: enough to land inside every beat of a film of up to twelve scenes.
const SAMPLES = 12;

const MIME = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
function serveDir(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/") p = "/index.html";
    const f = path.resolve(path.join(root, p));
    if (!f.startsWith(root)) { res.statusCode = 403; return res.end(); }
    fs.readFile(f, (e, b) => {
      if (e) { res.statusCode = 404; return res.end(); }
      res.setHeader("Content-Type", MIME[path.extname(f).toLowerCase()] || "application/octet-stream");
      res.end(b);
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, port: server.address().port })));
}

const PROBE = () => {
  const out = [];
  for (const img of document.querySelectorAll("img")) {
    const cs = getComputedStyle(img);
    // Only shotFill's own signature: absolute + inset:0 + object-fit.
    if (cs.position !== "absolute") continue;
    if (!(cs.inset === "0px" || (cs.top === "0px" && cs.left === "0px" && cs.right === "0px" && cs.bottom === "0px"))) continue;
    const parent = img.parentElement;
    if (!parent) continue;
    const pcs = getComputedStyle(parent);
    // The parent IS a containing block: nothing to check.
    if (pcs.position !== "static" || pcs.transform !== "none" || pcs.filter !== "none" || pcs.contain !== "none") continue;

    const i = img.getBoundingClientRect(), p = parent.getBoundingClientRect();
    if (i.width < 2 || i.height < 2) continue;              // not laid out; a hidden beat
    const slack = 1.5;
    const escapes = i.left < p.left - slack || i.top < p.top - slack || i.right > p.right + slack || i.bottom > p.bottom + slack;
    if (!escapes) continue;
    out.push({
      cls: String(parent.className || "").slice(0, 40),
      tag: parent.tagName.toLowerCase(),
      img: `${Math.round(i.width)}x${Math.round(i.height)}`,
      box: `${Math.round(p.width)}x${Math.round(p.height)}`,
      over: `${Math.round(Math.max(0, p.left - i.left) + Math.max(0, i.right - p.right))}px wide, ${Math.round(Math.max(0, p.top - i.top) + Math.max(0, i.bottom - p.bottom))}px tall`,
    });
  }
  return out;
};

async function main() {
  let puppeteer;
  try { puppeteer = require("puppeteer-core"); } catch { console.error("puppeteer-core not installed"); process.exit(3); }
  const exe = findChromium();
  if (!exe) { console.error("no cached Chrome found — set PUPPETEER_EXECUTABLE_PATH"); process.exit(3); }

  const packs = frameRegistry.listPacks().filter((p) => composerModuleFor((fm.getManifest(p) || {}).renderer));
  console.log(`\nSHOT-CONTAINMENT GUARD — ${packs.length} pack(s) with a dedicated composer\n`);

  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  for (const a of ASSETS) {
    fs.writeFileSync(path.join(WORK, a.path),
      `<svg xmlns="http://www.w3.org/2000/svg" width="${a.width || 400}" height="${a.height || 400}"><rect width="100%" height="100%" fill="#2b3a55"/></svg>`, "utf8");
  }

  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  const served = await serveDir(WORK);
  let failed = 0, checked = 0;

  try {
    for (const pack of packs) {
      const comp = composerModuleFor((fm.getManifest(pack) || {}).renderer);
      const manifest = fm.getManifest(pack) || {};
      const portrait = String(manifest.orientation || "").toLowerCase() === "portrait";
      const dims = portrait ? { width: 1080, height: 1920, fps: 30 } : { width: 1920, height: 1080, fps: 30 };

      let built;
      try {
        built = comp.buildComposition({
          storyboard: JSON.parse(JSON.stringify(SB)), dims, framePack: pack,
          assets: ASSETS, captionCues: [], brandSkin: null, seedKey: `shotfit-${pack}`,
        });
      } catch (e) {
        console.log(`  ✗ ${pack}: buildComposition threw — ${String(e.message).slice(0, 110)}`);
        failed++; continue;
      }
      if (!built || !built.indexHtml) continue;
      fs.writeFileSync(path.join(WORK, "index.html"), built.indexHtml, "utf8");

      const page = await browser.newPage();
      await page.setViewport({ width: dims.width, height: dims.height, deviceScaleFactor: 1 });
      let bad = [];
      try {
        await page.goto(`http://127.0.0.1:${served.port}/index.html`, { waitUntil: "load", timeout: 45_000 });
        await page.waitForFunction(() => !!(window.__timelines && window.__timelines.vid), { timeout: 45_000 }).catch(() => {});
        // MUST SEEK. The first version of this guard probed the loaded page and reported 35/35 —
        // then failed its own calibration: re-introducing the momentum phone bug changed nothing.
        // At t=0 only the opening beat has layout; every later scene is hidden, so its boxes are
        // zero-sized and skipped. Sampling across the timeline is what actually inspects the film.
        const seen = new Map();
        for (let k = 0; k < SAMPLES; k++) {
          await page.evaluate((frac) => {
            const tl = window.__timelines && window.__timelines.vid;
            if (!tl) return;
            const t = tl.duration() * frac;
            tl.seek(t, false);
            window.dispatchEvent(new CustomEvent("hf-seek", { detail: { t } }));
          }, (k + 0.5) / SAMPLES);
          for (const hit of await page.evaluate(PROBE)) seen.set(`${hit.cls}|${hit.box}|${hit.img}`, hit);
        }
        bad = [...seen.values()];
      } catch (e) {
        console.log(`  ✗ ${pack}: could not load — ${String(e.message).slice(0, 110)}`);
        failed++; await page.close().catch(() => {}); continue;
      }
      await page.close().catch(() => {});
      checked++;

      const real = bad.filter((b) => !EXEMPT.some((e) => e.pack === pack && e.re && e.re.test(b.cls)));
      if (real.length) {
        failed++;
        console.log(`  ✗ ${pack}: ${real.length} screenshot(s) escaping their frame`);
        for (const b of real.slice(0, 4)) console.log(`      <${b.tag} class="${b.cls}"> box ${b.box}, image ${b.img} — overflows ${b.over}`);
        if (real.length > 4) console.log(`      (+${real.length - 4} more)`);
      } else {
        console.log(`  ✓ ${pack}: every screenshot stays inside its frame`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
    served.server.close();
  }

  console.log(`\n${checked - failed} passed, ${failed} failed  (${checked} composition(s) inspected)`);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
