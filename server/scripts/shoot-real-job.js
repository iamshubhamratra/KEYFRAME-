// BEFORE / AFTER ON A REAL JOB'S OWN ASSETS.
//
//   node scripts/shoot-real-job.js --job jobs/pkffl0i9dz --pack ignition [--dims 1920x1080]
//                                  [--raw] [--out DIR]
//
// The synthetic probe in scripts/audit-slot-fit.js measures geometry; this renders the
// actual pictures a shipped film was built from, so the fix can be LOOKED AT rather than
// only counted. `--raw` skips the crop engine and the render-time fitter, which reproduces
// what the film shipped as; without it you get what the same assets produce now.

const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

const JOB = path.resolve(opt("--job", "jobs/pkffl0i9dz"));
const PACK = opt("--pack", "ignition");
const RAW = has("--raw");
const [W, H] = opt("--dims", "1920x1080").split("x").map(Number);
const OUT = path.resolve(opt("--out", path.join(__dirname, `real-shots-${PACK}-${W}x${H}${RAW ? "-raw" : ""}`)));

const frameManifest = require("../src/services/frame_manifest");
const { findChrome } = require("../src/services/ingest/website");
const { PACK_RENDERERS } = require("../src/services/pipeline");

// The storyboard the failing film narrated, close enough to route the same beats.
const STORYBOARD = {
  title: "One intelligent canvas", brand: "Figma", url: "figma.com", durationSec: 32,
  scenes: [
    { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "hook", kicker: "INTELLIGENT CANVAS", headline: "One intelligent canvas", subtext: "Where design, AI, and production code converge on a single infinite stage.", voiceover: "Where design, AI and production code converge." },
    { id: "s2", start: 4, duration: 4, kind: "feature", purpose: "feature", kicker: "FIGJAM WORKSPACE", headline: "Brainstorm in FigJam", subtext: "Live multiplayer cursors on one shared board.", bullets: ["Live cursors", "Shared boards"], voiceover: "Brainstorm together in FigJam." },
    { id: "s3", start: 8, duration: 4, kind: "demo", purpose: "demo", kicker: "AI CAPABILITIES", headline: "AI-native canvas", subtext: "A glowing intelligent cursor constructs nested layout components with shared context.", voiceover: "An AI-native canvas." },
    { id: "s4", start: 12, duration: 4, kind: "proof", purpose: "proof", kicker: "ENTERPRISE", headline: "Trusted by global teams", badge: "95%", badgeLabel: "of the Fortune 500", subtext: "Global engineering and design teams standardize on Figma.", voiceover: "Trusted by global teams." },
    { id: "s5", start: 16, duration: 4, kind: "stat", purpose: "stat", headline: "faster to ship", emphasis: "2x", stats: [{ v: 2, suf: "X", l: "faster to ship" }], voiceover: "Twice as fast to ship." },
    { id: "s6", start: 20, duration: 4, kind: "bullet", purpose: "how", headline: "Design. Prototype. Ship.", bullets: ["Design it", "Prototype it", "Ship it"], voiceover: "Design, prototype, ship." },
    { id: "s7", start: 24, duration: 4, kind: "feature", purpose: "feature", kicker: "DEV MODE", headline: "Ship production code", subtext: "Dev Mode translates design properties directly into clean React syntax.", voiceover: "Ship production code." },
    { id: "s8", start: 28, duration: 4, kind: "cta", purpose: "cta", kicker: "READY", headline: "One connected workspace", cta: "Get started", voiceover: "One connected workspace." },
  ],
};

function assetsFrom(jobDir) {
  const dir = path.join(jobDir, "assets", "images");
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const rel = `assets/images/${f}`;
    if (/^logo\./i.test(f) || /^brand_/i.test(f)) { out.push({ path: rel, type: "image", kind: "logo", source: "website-logo", alt: "the Figma logo" }); continue; }
    if (/\.svg$/i.test(f)) { out.push({ path: rel, type: "image", source: "iconify", alt: "a topical vector", visionOk: true }); continue; }
    if (/^site_/i.test(f)) {
      out.push({
        path: rel, type: "image", kind: "screenshot", source: "website", visionOk: true,
        cdScore: 88, cdProminence: "hero",
        alt: `REAL website screenshot of Figma — ${f.replace(/\.\w+$/, "").replace(/_/g, " ")}`,
        sees: "the Figma product page",
      });
      continue;
    }
    out.push({ path: rel, type: "image", source: /^siteimg/i.test(f) ? "website-image" : "pixabay", visionOk: true, cdScore: 66, alt: "an image from the site" });
  }
  return out;
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error("no Chromium found"); process.exit(2); }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.cpSync(path.join(JOB, "assets"), path.join(OUT, "assets"), { recursive: true });

  const assets = assetsFrom(OUT);
  const renderer = (() => { try { return (frameManifest.getManifest(PACK) || {}).renderer; } catch { return null; } })();
  const composer = (renderer && PACK_RENDERERS[renderer] && PACK_RENDERERS[renderer].composer) || require("../src/services/scene_kit");

  if (!RAW) {
    // Exactly the two steps the live orchestrator now runs before composing.
    const { ffprobeImage } = require("../src/services/asset_sources/util");
    for (const a of assets) {
      if (a.width > 0) continue;
      try { const d = await ffprobeImage(path.join(OUT, a.path)); if (d && d.width) { a.width = d.width; a.height = d.height; a.ratio = d.width / d.height; } } catch { /* skip */ }
    }
    const TM = require("../src/services/template_media");
    const fam = composer.FAMILY || null;
    const aspects = fam ? TM.aspectsForFamily(fam, { width: W, height: H }) : [];
    const rep = await require("../src/services/crop_engine").annotateAssets(assets, {
      jobDir: OUT, aspects: aspects.length ? aspects : (W >= H ? [1.6, 1.0, 0.75] : [1.5, 0.9, 2.6]),
    });
    console.log(`crop_engine: ${rep.analyzed} analysed (${rep.source}) for [${(aspects.length ? aspects : ["generic"]).join(", ")}]`);
  }

  const built = composer.buildComposition({ storyboard: STORYBOARD, dims: { width: W, height: H, fps: 30 }, framePack: PACK, assets, seedKey: "real-shots" });
  let html = built.indexHtml;
  if (!RAW) {
    const tag = require("../src/services/asset_fit").runtimeFitScript(assets);
    if (tag) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tag}</body>`) : html + tag;
  }
  fs.writeFileSync(path.join(OUT, "index.html"), html, "utf8");

  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--allow-file-access-from-files"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(OUT, "index.html").replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 60_000 });
  const hasTl = await page.waitForFunction(() => !!(window.__timelines && window.__timelines.vid), { timeout: 20_000, polling: 400 }).then(() => true).catch(() => false);
  await page.evaluate((w, h) => {
    document.documentElement.style.margin = "0"; document.body.style.margin = "0";
    const r = document.querySelector("#root") || document.querySelector(".composition");
    if (r) { r.style.width = w + "px"; r.style.height = h + "px"; }
  }, W, H).catch(() => {});

  for (const sc of STORYBOARD.scenes) {
    const t = sc.start + sc.duration / 2;
    if (hasTl) await page.evaluate((tt) => { const tl = window.__timelines.vid; tl.pause(); tl.time(tt, false); }, t).catch(() => {});
    else await page.evaluate((tt) => { (document.querySelector("#root") || document.body).setAttribute("data-om-seek-to-time-frame", String(tt)); }, t).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: path.join(OUT, `${sc.id}_${sc.kind}.png`) });
  }
  await browser.close().catch(() => {});
  console.log(`${STORYBOARD.scenes.length} frame(s) in ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
