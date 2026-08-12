// FRAME-FILL GUARD — a pack must not be offered a frame shape its layout cannot fill.
//
// WHY THIS EXISTS. Eighteen packs declared no `orientation`, which `packFitsOrientation` reads
// as "aspect-agnostic, lays out through responsive.js". That was true while they rendered
// through the scene kit. It stopped being true when each was given a dedicated composer
// authored at `stageOf(1920, 1080)` with no portrait branch — and nothing noticed, because a
// composition that fills a third of its frame is valid HTML, lints clean, keeps its golden
// hash, animates every tween and reveals every element. It is only wrong in LAYOUT, and only
// the browser knows.
//
// Measured on the 12 that were still eligible for 9:16: they lose 2.46x-2.85x of their content
// density when rendered tall. A 16:9 frame is 56.25cqw tall and a 9:16 frame is 177.8cqw tall,
// so a layout that measures every height in width units keeps its size while the frame grows
// 3.16x. The composition does not break; it stops being a composition.
//
// WHAT IT ASSERTS. For each pack, build at BOTH aspects and measure the fraction of the frame
// covered by text and picture boxes. If a pack's density at some aspect is below
// `MIN_RATIO` of its density at its authored aspect, it must NOT be eligible for that aspect
// (`frame_manifest.packFitsOrientation`). Eligibility and layout must agree.
//
// THE TEST IS SELF-RELATIVE ON PURPOSE. An absolute ink floor would fail the WebGL packs
// (flagship, brightlife) for a limitation of the probe rather than a fault in the pack: their
// content is painted into a full-bleed canvas, which is excluded from the measurement so that
// wallpaper is never counted as composition. Comparing a pack against ITSELF at another aspect
// cancels any such bias, because both halves are measured the same way.
//
//   npm run test:frame-fill              # the sampled tier: one pack per engine + calibration
//   node scripts/test-frame-fill.js --all       # every pack (slow: two builds each)
//   node scripts/test-frame-fill.js reel orbit  # named packs
//   node scripts/test-frame-fill.js --all --report   # print the table, never fail
//
// CALIBRATION — RECORDED, because a guard that has never failed has never been tested.
// Run against the 18 undeclared packs BEFORE they were declared (11 Aug 2026), this failed 14
// of them, at 0.38x-0.66x of their own density, and passed the four that genuinely adapt
// (flagship 0.77, bloom-fable 0.78, paper-tales 1.28, brightlife 1.35). `blockframe` is kept in
// SAMPLE as the negative control: it failed at 0.42x until `orientation: "landscape"` was
// declared, so deleting that key from its manifest must turn this guard red again. If it does
// not, the guard is broken, not the library.
//
// One open disagreement, deliberately not smoothed over: `bloom-fable` measures 0.78 on these
// three beats and 0.39 across all eight, so some of its beats adapt and some do not. It is left
// eligible for portrait pending a look at its frames — `--all` plus scripts/shot-pack.js.
// `--report` on the full library produced the numbers in VERTICAL-QUALITY-PLAN.md §0.

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");
const { findChromium } = require("./shot-reference");

const WORK = path.join(__dirname, "..", "jobs", "_framefill");
const LAND = { width: 1920, height: 1080, fps: 30 };
const PORT = { width: 1080, height: 1920, fps: 30 };

// A pack may lose this much density at a foreign aspect before its eligibility is a lie.
// The observed split is unambiguous — the packs that adapt sit at 0.85-1.0 and above (paper-tales
// and brightlife are actually DENSER tall), and the packs that do not sit at 0.36-0.41. 0.70 is
// the wide gap between the two populations, not a tuned number.
const MIN_RATIO = 0.7;

// THE SAMPLED TIER. One pack per engine, so a kit-level regression cannot hide, plus the
// calibration pair: `orbit` adapts nothing and correctly declares landscape; `blockframe` is the
// class this guard was written for. Both must keep behaving as recorded or the guard is blind.
const SAMPLE = [
  "orbit",          // om_port_kit, landscape-authored
  "showcase",       // om_port_kit, landscape-authored, picture-heavy
  "reel",           // om_port_kit, portrait-authored
  "teampulse",      // om_port_kit, portrait-authored
  "organic-garden", // om_stage
  "rocket-nights",  // film_stage
  "grid-dispatch",  // bespoke portrait native
  "prisma-bloc",    // bespoke portrait native
  "flagship",       // WebGL, responsive.js — the probe's hardest case
  "blockframe",     // CALIBRATION: landscape-authored; must fail portrait eligibility
];

// ---- fixture ------------------------------------------------------------------
// PNG, and every picture carries a `sceneId`. Both matter: several composers reject `.svg`
// for a picture plate on purpose (bauhaus_composer.js:190), and several seat a picture only on
// a scene-id match, which is what the Creative Director assigns in production. An SVG or
// unassigned fixture measures those packs as drawing nothing at all — a fixture defect that
// reads exactly like a pack defect, and one this harness made twice before it was calibrated.
const ASSET_SPECS = [
  { file: "a0.png", ratio: 1.78, width: 1600, height: 900, source: "website", kindHint: "screenshot", cdProminence: "hero", visionOk: true, cdScore: 0.92, alt: "shot", sceneId: "s2" },
  { file: "a1.png", ratio: 0.8, width: 1000, height: 1250, source: "upload", kindHint: "screenshot", cdProminence: "support", cdScore: 0.8, alt: "mobile", sceneId: "s3" },
  { file: "a2.png", ratio: 1.4, width: 1400, height: 1000, source: "website-asset", kindHint: "photo", cdProminence: "support", visionOk: true, cdScore: 0.7, alt: "photo", sceneId: "s4" },
  { file: "a3.png", ratio: 1.0, width: 1200, height: 1200, source: "upload", kindHint: "photo", cdProminence: "support", cdScore: 0.66, alt: "square", sceneId: "s5" },
  { file: "a4.png", ratio: 0.75, width: 900, height: 1200, source: "upload", kindHint: "screenshot", cdProminence: "support", cdScore: 0.64, alt: "phone", sceneId: "s6" },
  { file: "a5.png", ratio: 1.6, width: 1600, height: 1000, source: "website", kindHint: "screenshot", cdProminence: "support", visionOk: true, cdScore: 0.6, alt: "wide", sceneId: "s7" },
];
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
// Three beats, not eight: an opener, a mid-film display beat and the close. The density of a
// design is a property of the design, and sampling every scene triples the wall clock to move
// the mean by under a point (checked against the full-sweep numbers).
const SAMPLE_SCENES = ["s1", "s5", "s8"];

const CACHE = path.join(WORK, "_assets");
async function buildAssetCache() {
  let sharp;
  try { sharp = require("sharp"); }
  catch (e) { throw new Error(`frame-fill needs sharp: ${e.message}`); }
  fs.mkdirSync(CACHE, { recursive: true });
  for (const s of [...ASSET_SPECS, { file: "logo.png", width: 400, height: 400 }]) {
    const p = path.join(CACHE, s.file);
    if (fs.existsSync(p)) continue;
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}"><rect width="100%" height="100%" fill="#9aa3ad"/><rect x="4%" y="6%" width="92%" height="16%" fill="#cdd4dc"/><rect x="4%" y="28%" width="60%" height="8%" fill="#e6eaef"/></svg>`);
    await sharp(svg).png().toFile(p);
  }
}
function writeAssets(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const s of ASSET_SPECS) {
    fs.copyFileSync(path.join(CACHE, s.file), path.join(dir, s.file));
    out.push({ path: s.file, type: "image", ratio: s.ratio, width: s.width, height: s.height, source: s.source, kindHint: s.kindHint, cdProminence: s.cdProminence, visionOk: s.visionOk, cdScore: s.cdScore, alt: s.alt, sceneId: s.sceneId });
  }
  fs.copyFileSync(path.join(CACHE, "logo.png"), path.join(dir, "logo.png"));
  out.push({ path: "logo.png", type: "image", width: 400, height: 400, source: "website-brand", role: "logo", alt: "logo" });
  return out;
}

// Compositions load GSAP from a CDN, and a `file://` page is a hostile origin for that, so the
// job dir is served over localhost exactly as the real renderer does. (Mirrors shot-pack.js.)
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
function serveDir(dir) {
  const rootResolved = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/" || p === "") p = "/index.html";
    const file = path.resolve(path.join(rootResolved, p));
    if (!file.startsWith(rootResolved)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.statusCode = 404; return res.end(); }
      res.setHeader("content-type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, close: () => server.close() })));
}

/* eslint-disable */
// Runs IN THE PAGE. Marks a 64x64 grid with every text-bearing and media box, so overlapping
// elements are counted once — a stack of six nested wrappers is one region of ink, not six.
function PROBE() {
  const FW = window.innerWidth, FH = window.innerHeight;
  const GX = 64, GY = 64, cw = FW / GX, ch = FH / GY;
  const ink = new Uint8Array(GX * GY), med = new Uint8Array(GX * GY);
  function mark(g, r) {
    const x0 = Math.max(0, Math.floor(r.left / cw)), x1 = Math.min(GX - 1, Math.floor((r.right - 0.01) / cw));
    const y0 = Math.max(0, Math.floor(r.top / ch)), y1 = Math.min(GY - 1, Math.floor((r.bottom - 0.01) / ch));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y * GX + x] = 1;
  }
  function effOpacity(el) {
    let o = 1, n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.visibility === "hidden" || cs.display === "none") return 0;
      o *= parseFloat(cs.opacity || "1");
      if (o < 0.06) return 0;
      n = n.parentElement;
    }
    return o;
  }
  let overflow = 0, clipped = 0, mediaCount = 0;
  const clipSamples = [];
  for (const el of document.querySelectorAll("body *")) {
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "DEFS") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > FW || r.top > FH) continue;
    if (effOpacity(el) === 0) continue;
    const isMedia = tag === "IMG" || tag === "CANVAS" || tag === "VIDEO";
    let ownText = "";
    for (const n of el.childNodes) if (n.nodeType === 3) ownText += n.nodeValue;
    ownText = ownText.replace(/\s+/g, " ").trim();
    if (!isMedia && !ownText) continue;
    // A full-bleed canvas or image is the pack's WORLD, not its composition. Counting it would
    // score every atmospheric pack at 100% and measure nothing.
    const fullBleed = r.width >= FW * 0.985 && r.height >= FH * 0.985;
    if (isMedia) {
      mediaCount++;
      if (!fullBleed) { mark(med, r); mark(ink, r); }
    } else {
      mark(ink, r);
      const cs = getComputedStyle(el);
      if ((cs.overflow !== "visible" || cs.textOverflow === "ellipsis")
        && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) {
        clipped++;
        if (clipSamples.length < 3) clipSamples.push(ownText.slice(0, 40));
      }
    }
    if (!fullBleed && (r.left < -3 || r.top < -3 || r.right > FW + 3 || r.bottom > FH + 3)) overflow++;
  }
  const frac = (g) => { let n = 0; for (let i = 0; i < g.length; i++) n += g[i]; return n / g.length; };
  return { ink: frac(ink), media: frac(med), overflow, clipped, clipSamples, mediaCount };
}
/* eslint-enable */

async function measure(browser, pack, dims) {
  const manifest = fm.getManifest(pack) || {};
  const composer = composerModuleFor(manifest.renderer);
  if (!composer) return { error: "no dedicated composer" };
  const jobDir = path.join(WORK, `${pack}-${dims.width}x${dims.height}`);
  fs.rmSync(jobDir, { recursive: true, force: true });
  const assets = writeAssets(jobDir);
  let built;
  try {
    built = composer.buildComposition({
      storyboard: JSON.parse(JSON.stringify(SB)), dims, framePack: pack, assets,
      captionCues: [], brandSkin: null, localized: null, seedKey: `framefill-${pack}`,
    });
  } catch (e) { return { error: `buildComposition threw: ${String(e.message).slice(0, 120)}` }; }
  if (!built || !built.indexHtml) return { error: "composer returned no indexHtml" };
  fs.writeFileSync(path.join(jobDir, "index.html"), built.indexHtml, "utf8");
  if (built.metaJson) fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
  await page.setViewport({ width: dims.width, height: dims.height, deviceScaleFactor: 1 });
  const served = await serveDir(jobDir);
  const rows = [];
  try {
    await page.goto(`http://127.0.0.1:${served.port}/index.html`, { waitUntil: "load", timeout: 45000 });
    await page.waitForFunction(() => !!(window.__timelines && window.__timelines.vid), { timeout: 45000 })
      .catch(() => { throw new Error("timeline never registered" + (errors[0] ? ` | ${errors[0]}` : "")); });
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    for (const id of SAMPLE_SCENES) {
      const sc = SB.scenes.find((s) => s.id === id);
      const t = sc.start + sc.duration * 0.55;
      await page.evaluate((time) => {
        const tl = window.__timelines.vid;
        tl.pause(); tl.seek(time, false);
        window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time } }));
      }, t);
      await new Promise((r) => setTimeout(r, 60));
      rows.push(await page.evaluate(PROBE));
    }
  } catch (e) {
    await page.close().catch(() => {}); served.close();
    return { error: String(e.message).slice(0, 150) };
  }
  await page.close().catch(() => {});
  served.close();
  const avg = (k) => rows.reduce((a, s) => a + s[k], 0) / rows.length;
  const sum = (k) => rows.reduce((a, s) => a + s[k], 0);
  return {
    ink: avg("ink"), media: avg("media"), overflow: sum("overflow"), clipped: sum("clipped"),
    clipSamples: [...new Set(rows.flatMap((s) => s.clipSamples))].slice(0, 2),
  };
}

(async () => {
  const args = process.argv.slice(2);
  const REPORT = args.includes("--report");
  const named = args.filter((a) => !a.startsWith("--"));
  const withComposer = frameRegistry.listPacks().filter((p) => composerModuleFor((fm.getManifest(p) || {}).renderer));
  const packs = named.length ? named
    : args.includes("--all") ? withComposer
      : SAMPLE.filter((p) => withComposer.includes(p));

  await buildAssetCache();
  let puppeteer;
  try { puppeteer = require("puppeteer-core"); }
  catch { console.error("frame-fill: puppeteer-core not installed — SKIPPED"); process.exit(0); }
  const exe = findChromium();
  if (!exe) { console.error("frame-fill: no Chromium available — SKIPPED"); process.exit(0); }
  const browser = await puppeteer.launch({
    executablePath: exe, headless: "new",
    args: ["--no-sandbox", "--font-render-hinting=none", "--hide-scrollbars"],
  });

  const failures = [];
  console.log("pack".padEnd(22) + "authored".padEnd(11) + "ink 16:9".padEnd(10) + "ink 9:16".padEnd(10) + "ratio".padEnd(8) + "verdict");
  for (const pack of packs) {
    const authored = fm.packOrientation(pack) || "(undeclared)";
    const L = await measure(browser, pack, LAND);
    const P = await measure(browser, pack, PORT);
    if (L.error || P.error) {
      const why = L.error || P.error;
      console.log(pack.padEnd(22) + authored.padEnd(11) + "ERROR " + why);
      failures.push(`${pack}: ${why}`);
      continue;
    }
    // Density at the pack's own aspect is the reference; the other aspect is judged against it.
    const own = authored === "portrait" ? P.ink : L.ink;
    const other = authored === "portrait" ? L.ink : P.ink;
    const otherOrientation = authored === "portrait" ? "horizontal" : "vertical";
    const ratio = own > 0 ? other / own : 1;
    const eligible = fm.packFitsOrientation(pack, otherOrientation);
    const survives = ratio >= MIN_RATIO;
    let verdict = "ok";
    if (eligible && !survives) {
      verdict = `FAIL — eligible for ${otherOrientation} at ${Math.round(ratio * 100)}% of its own density`;
      failures.push(`${pack}: selectable by ${otherOrientation} jobs, but its layout keeps only `
        + `${Math.round(ratio * 100)}% of its density there (floor ${Math.round(MIN_RATIO * 100)}%). `
        + `Declare "orientation" in frames/${pack}/pack.json, or author a ${otherOrientation} layout.`);
    } else {
      verdict = `ok (${Math.round(ratio * 100)}% at ${otherOrientation}, ${eligible ? "offered" : "not offered"})`;
    }
    // DELIBERATELY ONE-DIRECTIONAL. A pack that keeps its density at a foreign aspect is NOT
    // thereby a candidate for it, and this must never suggest widening eligibility: density is
    // not correctness. The portrait OM packs measure DENSER at 16:9 while the portrait audit
    // measured their deepest box overflowing a landscape frame by 76% — a layout can be busy and
    // broken at the same time. Only the unsafe direction is an assertion.
    if (P.clipped || L.clipped) {
      const s = (P.clipSamples[0] || L.clipSamples[0] || "").trim();
      failures.push(`${pack}: ${P.clipped + L.clipped} clipped text box(es)${s ? ` — e.g. "${s}"` : ""}`);
      verdict += (verdict === "ok" ? "FAIL — " : " · ") + "clipped text";
    }
    console.log(pack.padEnd(22) + authored.padEnd(11)
      + (L.ink * 100).toFixed(1).padEnd(10) + (P.ink * 100).toFixed(1).padEnd(10)
      + (ratio.toFixed(2) + "x").padEnd(8) + verdict);
  }
  await browser.close();

  if (REPORT) { console.log(`\nframe-fill: report only — ${failures.length} would-be failure(s)`); process.exit(0); }
  if (failures.length) {
    console.error(`\nframe-fill: ${failures.length} failure(s)`);
    for (const f of failures) console.error(`  FAIL  ${f}`);
    process.exit(1);
  }
  console.log(`\nframe-fill: ${packs.length} pack(s) — eligibility matches layout at every aspect`);
})();
