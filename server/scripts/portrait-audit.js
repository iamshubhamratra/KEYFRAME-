// PORTRAIT AUDIT — builds real compositions at 1080x1920 (9:16) and
// screenshots each scene so portrait layout bugs are VISIBLE, not guessed.
//
//   node scripts/portrait-audit.js [--packs a,b,c] [--out DIR] [--dims WxH]
//
// Defaults: packs = kinetic-bold,summit-keynote,blueprint-atelier (the last
// routes to the dedicated blueprint composer), out = scripts/portrait-audit-out.
// Uses the same cached Chromium the renderer uses; seeks the paused GSAP
// timeline to each scene midpoint (same contract as contrast_check.js).
// Each build also gets a `preview.html` (GSAP inlined + auto-play scrubber) so
// the composition is viewable offline in a browser / VS Code Live Server.

const fs = require("node:fs");
const path = require("node:path");
const sceneKit = require("../src/services/scene_kit");
const blueprint = require("../src/services/blueprint_composer");
// Same renderer → composer routing as pipeline.js PACK_RENDERERS.
const DEDICATED = {
  "blueprint": blueprint,
  "bauhaus-riot": require("../src/services/bauhaus_composer"),
  "bloom-fable": require("../src/services/bloom_composer"),
  "three-flagship": require("../src/services/flagship_composer"),
  "three-brightlife": require("../src/services/brightlife_composer"),
};
const { findChrome } = require("../src/services/ingest/website");
const frameManifest = require("../src/services/frame_manifest");
const { spawnSync } = require("node:child_process");

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : dflt; };
const PACKS = opt("--packs", "kinetic-bold,summit-keynote,blueprint-atelier").split(",");
const OUT = path.resolve(opt("--out", path.join(__dirname, "portrait-audit-out")));
const [W, H] = opt("--dims", "1080x1920").split("x").map(Number);
const dims = { width: W, height: H, fps: 30 };

const storyboard = {
  title: "Acme Flow Story",
  durationSec: 15,
  scenes: [
    { id: "s1", start: 0, duration: 3, kind: "hook", headline: "Your team ships faster", emphasis: "faster", subtext: "One tool for planning, docs and delivery." },
    { id: "s2", start: 3, duration: 3, kind: "stat", headline: "faster to launch", emphasis: "8x", subtext: "8x" },
    { id: "s3", start: 6, duration: 3, kind: "feature", purpose: "feature", headline: "Everything in one place", subtext: "Real product, real screens.", bullets: ["Live boards", "Instant docs"] },
    { id: "s4", start: 9, duration: 3, kind: "bullet", purpose: "how", headline: "How it works", bullets: ["Connect your repo", "Plan the sprint", "Ship on Friday"] },
    { id: "s5", start: 12, duration: 3, kind: "cta", headline: "Start free today", emphasis: "free", subtext: "No card needed." },
  ],
};

// Dummy assets (solid PNGs via ffmpeg) — enough to trigger the screenshot-hero
// and photo-weaving archetypes without network.
function makeAssets(dir) {
  fs.mkdirSync(path.join(dir, "assets", "images"), { recursive: true });
  const mk = (name, color, w, h) => {
    const p = path.join(dir, "assets", "images", name);
    spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${color}:s=${w}x${h}`, "-frames:v", "1", p]);
    return `assets/images/${name}`;
  };
  return [
    { path: mk("shot.png", "0x3355AA", 2732, 1800), type: "image", sceneId: "s3", source: "website", style: "inset", visionOk: true, width: 2732, height: 1800, ratio: 2732 / 1800, alt: "REAL website screenshot of Acme — homepage hero" },
    { path: mk("photo1.png", "0xAA5533", 1600, 1000), type: "image", source: "pixabay", visionOk: true, width: 1600, height: 1000, ratio: 1.6, alt: "team collaborating" },
    { path: mk("photo2.png", "0x33AA55", 1000, 1500), type: "image", source: "pixabay", visionOk: true, width: 1000, height: 1500, ratio: 0.667, alt: "product on desk" },
  ];
}

// Offline preview: the built index.html has a PAUSED timeline (for frame-seeking)
// and pulls GSAP from a CDN, so it renders blank when opened directly in a
// browser / VS Code Live Server. Alongside each build we drop a `preview.html`
// that inlines GSAP (works with no network) and auto-plays + loops the timeline
// with a spacebar scrubber — purely a dev-viewing aid, never rendered.
let _gsapCache; // read the local GSAP once per run
function localGsap() {
  if (_gsapCache !== undefined) return _gsapCache;
  const candidates = [
    path.join(__dirname, "..", "..", "web", "node_modules", "gsap", "dist", "gsap.min.js"),
    path.join(__dirname, "..", "node_modules", "gsap", "dist", "gsap.min.js"),
    path.join(__dirname, "..", "showcase", "flagship", "gsap.min.js"),
  ];
  for (const p of candidates) {
    try { _gsapCache = fs.readFileSync(p, "utf8"); return _gsapCache; } catch { /* try next */ }
  }
  _gsapCache = null;
  return null;
}

// Also SIZE + SCALE #root: the composition's #root carries data-width/height but
// no CSS size (the hyperframes render runtime sizes it), so a browser collapses
// it to 0px and shows blank. Fit it to the viewport, centered, then autoplay the
// paused timeline (retry-waiting until GSAP registers it).
const PREVIEW_INJECT = `
<style>html,body{margin:0;background:#0d0d10;overflow:hidden}</style>
<div id="__pv" style="position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;
  font:12px ui-monospace,monospace;background:rgba(0,0,0,.72);color:#fff;padding:7px 12px;border-radius:999px;
  display:flex;gap:12px;align-items:center;user-select:none;pointer-events:none;white-space:nowrap">
  <span id="__pvt">loading…</span><span style="opacity:.6">space = pause/scrub &middot; click = restart</span></div>
<script>
(function(){
  function fit(){
    var r=document.getElementById("root"); if(!r) return;
    var w=+r.getAttribute("data-width")||1080, h=+r.getAttribute("data-height")||1920;
    r.style.position="fixed"; r.style.top="50%"; r.style.left="50%"; r.style.margin="0";
    r.style.width=w+"px"; r.style.height=h+"px"; r.style.transformOrigin="center center";
    var pad=32, s=Math.min((innerWidth-pad)/w,(innerHeight-pad)/h);
    r.style.transform="translate(-50%,-50%) scale("+s+")";
  }
  addEventListener("resize",fit); fit();
  var lbl=document.getElementById("__pvt");
  (function wait(n){
    var tl=window.__timelines && window.__timelines["vid"];
    if(!tl){ if(n<250) return setTimeout(function(){wait(n+1);},60); if(lbl)lbl.textContent="no timeline"; return; }
    var dur=tl.duration();
    tl.eventCallback("onUpdate", function(){ if(lbl)lbl.textContent = tl.time().toFixed(1)+"s / "+dur.toFixed(0)+"s"; });
    tl.eventCallback("onComplete", function(){ tl.play(0); });
    tl.play(0);
    addEventListener("keydown", function(e){ if(e.code==="Space"){ e.preventDefault(); tl.paused()?tl.play():tl.pause(); }});
    addEventListener("click", function(){ tl.play(0); });
  })(0);
})();
</script>`;

function writePreview(dir, indexHtml) {
  const gsap = localGsap();
  let html = indexHtml;
  if (gsap) {
    const tag = "<script>/* gsap inlined for offline preview */\n" + gsap + "\n</scr" + "ipt>";
    html = html.replace(/<script\s+src="https?:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"]*"><\/script>/i, tag);
  }
  html = html.replace(/<\/body>/i, PREVIEW_INJECT + "\n</body>");
  fs.writeFileSync(path.join(dir, "preview.html"), html, "utf8");
  return !!gsap;
}

async function shoot(page, dir, label) {
  const url = "file://" + path.join(dir, "index.html").replace(/\\/g, "/");
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
  // polling:'raf' (the default) never fires under --disable-gpu headless; poll
  // on a plain interval, and return a BOOLEAN (returning the timeline object
  // itself made waitForFunction misbehave).
  const hasTl = await page.waitForFunction(
    () => !!(window.__timelines && window.__timelines["vid"]), { timeout: 15_000, polling: 500 },
  ).then(() => true).catch((e) => { console.warn(`  [waitTl] ${String(e.message || e).slice(0, 160)}`); return false; });
  if (!hasTl) {
    const diag = await page.evaluate(() => ({
      gsap: typeof window.gsap,
      tls: Object.keys(window.__timelines || {}),
      scripts: [...document.querySelectorAll("script[src]")].map((s) => s.src),
    })).catch((e) => ({ err: String(e) }));
    console.warn(`  ${label}: no seekable timeline — ${JSON.stringify(diag)}`);
    return;
  }
  // scene_kit's #root is sized by the HyperFrames runtime (data-width/height,
  // no CSS) — size it here or it collapses to 0 height and shoots blank.
  await page.evaluate((w, h) => {
    document.documentElement.style.margin = "0";
    document.body.style.margin = "0";
    const root = document.querySelector("#root") || document.querySelector(".composition");
    if (root) { root.style.width = w + "px"; root.style.height = h + "px"; }
  }, W, H);
  for (const sc of storyboard.scenes) {
    const t = sc.start + sc.duration / 2;
    await page.evaluate((tt) => {
      const tl = window.__timelines["vid"];
      tl.pause();
      tl.time(tt, false);
    }, t);
    await new Promise((r) => setTimeout(r, 350)); // GSAP flush + canvas FX paint
    const out = path.join(OUT, `${label}_${sc.id}_${sc.kind}.png`);
    await page.screenshot({ path: out });
    console.log(`  ${path.basename(out)}`);
  }
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error("no Chromium found"); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });

  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true,
    // SwiftShader (software WebGL) instead of --disable-gpu: the Three.js
    // composers need a WebGL context even for a seek-and-screenshot pass.
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", `--window-size=${W},${H}`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.warn(`  [pageerror] ${String(e.message || e).slice(0, 200)}`));
  page.on("requestfailed", (r) => console.warn(`  [reqfail] ${r.url().slice(0, 120)} ${r.failure()?.errorText || ""}`));

  try {
    for (const pack of PACKS) {
      const dir = path.join(OUT, `build_${pack}`);
      fs.mkdirSync(dir, { recursive: true });
      const assets = makeAssets(dir);
      let renderer = null;
      try { renderer = (frameManifest.getManifest(pack) || {}).renderer; } catch { /* no manifest */ }
      console.log(`\n▐ ${pack} @ ${W}x${H}${renderer ? ` (dedicated: ${renderer})` : " (scene-kit)"}`);
      let built;
      if (DEDICATED[renderer]) {
        built = DEDICATED[renderer].buildComposition({ storyboard, dims, framePack: pack, assets });
      } else {
        built = sceneKit.buildComposition({ storyboard, dims, framePack: pack, assets, seedKey: "portrait-audit" });
      }
      fs.writeFileSync(path.join(dir, "index.html"), built.indexHtml, "utf8");
      const offline = writePreview(dir, built.indexHtml);
      console.log(`  preview.html (${offline ? "offline — GSAP inlined" : "online — local GSAP not found, CDN kept"})`);
      await shoot(page, dir, pack);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(`\nscreenshots in ${OUT}`);
  console.log(`open any build_<pack>/preview.html in a browser / Live Server to view the animation`);
})().catch((e) => { console.error(e); process.exit(1); });
