// DROPPED-CSS GUARD — every declaration we emit must survive the browser.
//
// WHY THIS EXISTS. Showcase shipped this line for its entire ambient colour wash:
//
//     radial-gradient(circle 26.81% at 12.24% 7.41%, ...)
//
// A percentage radius is invalid for `circle` (only `ellipse` takes percentages, and it needs
// two), so Chromium rejected the whole comma-joined `background` value. FOURTEEN blob layers
// across a seven-scene film reported `background-image: none` while their inline style plainly
// contained the gradients. The reference's five-colour atmosphere never painted, in any scene, in
// any delivered film — and it was the single largest visual gap in that port.
//
// NOTHING COULD HAVE CAUGHT IT. `hyperframes lint` parses structure, the golden hashes hash the
// HTML string, `test-ghosts` checks elements are revealed, and `test-dead-tweens` checks a tween's
// target exists. Every one of them passes on this bug, because the CSS *is* in the document. Only
// the browser knows it refused it, and nothing was asking the browser.
//
// HOW IT DETECTS. The CSSOM silently DISCARDS invalid declarations: a property present in the raw
// `style` attribute but absent from `el.style` was rejected. That comparison is exact — no
// heuristics, no allowlist of "valid" CSS to maintain, and it stays correct as the CSS spec grows.
//
// Run: npm run test:dropped-css

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");
const { findChromium } = require("./shot-reference");

const WORK = path.join(__dirname, "..", "jobs", "_dropcss");
const ASSETS = [
  { path: "a0.svg", type: "image", ratio: 1.78, width: 1600, height: 900, source: "website", kindHint: "screenshot", cdProminence: "hero", visionOk: true, cdScore: 0.92, alt: "shot" },
  { path: "a1.svg", type: "image", ratio: 0.8, width: 1000, height: 1250, source: "upload", kindHint: "screenshot", cdProminence: "support", cdScore: 0.8, alt: "mobile" },
  { path: "a2.svg", type: "image", ratio: 1.4, width: 1400, height: 1000, source: "website-asset", kindHint: "photo", cdProminence: "support", visionOk: true, cdScore: 0.7, alt: "photo" },
  { path: "a3.svg", type: "image", ratio: 1.0, width: 1200, height: 1200, source: "upload", kindHint: "photo", cdProminence: "support", cdScore: 0.66, alt: "square" },
  { path: "logo.svg", type: "image", width: 400, height: 400, source: "website-brand", role: "logo", alt: "logo" },
];
const SB = { title: "Acme", durationSec: 22, scenes: [
  { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "intro", headline: "Ship faster with Acme", subtext: "The developer cloud." },
  { id: "s2", start: 4, duration: 4, kind: "feature", purpose: "feature", headline: "One dashboard for everything", subtext: "Everything that matters.", onScreenText: ["Deploys", "Metrics", "Logs"] },
  { id: "s3", start: 8, duration: 4, kind: "quote", purpose: "testimonial", headline: "The best tool we use", subtext: "CTO, Acme" },
  { id: "s4", start: 12, duration: 3.5, kind: "stat", purpose: "result", headline: "Deploy in 8 seconds", emphasis: "8s", subtext: "99.9% uptime, 12ms latency." },
  { id: "s5", start: 15.5, duration: 3.5, kind: "feature", purpose: "feature", headline: "Every screen, one glance", subtext: "Built for the team." },
  { id: "s6", start: 19, duration: 3, kind: "cta", purpose: "cta", headline: "Acme Cloud", emphasis: "Start free", subtext: "acme.dev" },
] };

// EXEMPTIONS — a deliberate, already-argued trade-off, not an oversight. Keep the reason with the
// entry: an exemption without one becomes a licence. (Empty: nothing has earned one yet.)
const EXEMPT = [];

const MIME = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".js": "text/javascript", ".json": "application/json" };
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

// Compare the raw `style` attribute against the parsed CSSOM. A property in the former and not the
// latter was REJECTED by the parser.
const PROBE = () => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("[style]")) {
    const raw = el.getAttribute("style") || "";
    // Split on top-level semicolons only — a gradient's own commas and parens must not confuse it.
    let depth = 0, buf = "", decls = [];
    for (const ch of raw) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === ";" && depth === 0) { decls.push(buf); buf = ""; continue; }
      buf += ch;
    }
    if (buf.trim()) decls.push(buf);
    for (const d of decls) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      const prop = d.slice(0, i).trim();
      if (!prop || prop.startsWith("--")) continue;   // custom properties are always accepted
      // `el.style` is the parsed CSSOM: an invalid declaration simply is not there.
      const kept = el.style.getPropertyValue(prop);
      if (kept !== "" && kept != null) continue;

      // A SHORTHAND THAT APPLIED CAN STILL SERIALISE BACK AS EMPTY. Chromium returns "" for
      // `style.border` in cases where it cannot round-trip the shorthand, even though
      // border-top-width et al are set — which made this guard's first run report a perfectly
      // valid `border: 0.46cqw solid #14110F` on prisma-bloc as rejected. So before believing the
      // shorthand is gone, ask whether ANY longhand under it was accepted. `el.style` is an
      // indexed list of the properties that actually took, so this is exact.
      let longhandTook = false;
      for (const setProp of el.style) {
        if (setProp === prop || setProp.startsWith(`${prop}-`)) { longhandTook = true; break; }
      }
      if (longhandTook) continue;

      // NO COMPUTED-VALUE ESCAPE HATCH. The first version of this guard also required
      // getComputedStyle(prop) to look "inert" before reporting — and that hole let a LIVE
      // critical defect through: reel's colour wash used the very same invalid
      // `radial-gradient(circle <pct>% ...)` as showcase, and its whole `background` was dropped,
      // yet computed `background` on a bare element returns the non-empty composite
      // "rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box", so the check
      // read it as "landed" and said nothing. Seven scenes with no colour, passing the guard built
      // to find exactly that.
      //
      // The CSSOM is already authoritative: `el.style` contains precisely what the parser
      // ACCEPTED. If neither the property nor any of its longhands is in there, it was rejected —
      // and the longhand scan above is what keeps a non-round-tripping shorthand (prisma-bloc's
      // `border`) from being misreported. A second opinion was never needed, only a correct first one.
      const value = d.slice(i + 1).trim();
      const key = `${prop}: ${value.slice(0, 90)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ prop, value: value.slice(0, 140), tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 40) });
    }
  }
  return out;
};

async function main() {
  let puppeteer;
  try { puppeteer = require("puppeteer-core"); } catch { console.error("puppeteer-core not installed"); process.exit(3); }
  const exe = findChromium();
  if (!exe) { console.error("no cached Chrome found — set PUPPETEER_EXECUTABLE_PATH"); process.exit(3); }

  const packs = frameRegistry.listPacks().filter((p) => composerModuleFor((fm.getManifest(p) || {}).renderer));
  console.log(`\nDROPPED-CSS GUARD — ${packs.length} pack(s) with a dedicated composer\n`);

  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  // One tiny SVG stands in for every asset: this guard is about CSS validity, not pictures.
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
          assets: ASSETS, captionCues: [], brandSkin: null, seedKey: `dropcss-${pack}`,
        });
      } catch (e) {
        console.log(`  ✗ ${pack}: buildComposition threw — ${String(e.message).slice(0, 110)}`);
        failed++; continue;
      }
      if (!built || !built.indexHtml) continue;
      fs.writeFileSync(path.join(WORK, "index.html"), built.indexHtml, "utf8");

      const page = await browser.newPage();
      await page.setViewport({ width: dims.width, height: dims.height, deviceScaleFactor: 1 });
      let dropped = [];
      try {
        await page.goto(`http://127.0.0.1:${served.port}/index.html`, { waitUntil: "load", timeout: 45_000 });
        await page.waitForFunction(() => !!(window.__timelines && window.__timelines.vid), { timeout: 45_000 }).catch(() => {});
        dropped = await page.evaluate(PROBE);
      } catch (e) {
        console.log(`  ✗ ${pack}: could not load — ${String(e.message).slice(0, 110)}`);
        failed++; await page.close().catch(() => {}); continue;
      }
      await page.close().catch(() => {});
      checked++;

      const real = dropped.filter((d) => !EXEMPT.some((e) => e.re && e.re.test(`${d.prop}: ${d.value}`)));
      if (real.length) {
        failed++;
        console.log(`  ✗ ${pack}: ${real.length} declaration(s) REJECTED by the browser`);
        for (const d of real.slice(0, 5)) console.log(`      <${d.tag}${d.cls ? ` class="${d.cls}"` : ""}>  ${d.prop}: ${d.value}`);
        if (real.length > 5) console.log(`      (+${real.length - 5} more)`);
      } else {
        console.log(`  ✓ ${pack}: every emitted declaration survives the parser`);
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
