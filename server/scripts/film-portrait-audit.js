// FILM PORTRAIT AUDIT — build a 9:16 long-form film from a film_skins pack and
// screenshot every scene, so vertical composition defects are VISIBLE.
//
//   node scripts/film-portrait-audit.js [--skin bound_volume] [--out DIR] [--tag before]
//
// Uses the REAL assets captured by job eiohb8i26v (2732x1800 website captures,
// 768x448 article images, a logo) so the geometry under test is the geometry
// that actually shipped.

const fs = require("node:fs");
const path = require("node:path");
const { findChrome } = require("../src/services/ingest/website");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const SKINS = opt("--skin", "bound_volume").split(",");
const TAG = opt("--tag", "shot");
const OUT = path.resolve(opt("--out", path.join(__dirname, "vfilm")));
const [W, H] = opt("--dims", "1080x1920").split("x").map(Number);
const ONLY = opt("--only", "");

// The source job whose assets we reuse.
const SRC = path.join(__dirname, "..", "jobs", "eiohb8i26v");

// A LONG-FORM storyboard: 16 scenes, ~120s, exercising every archetype the
// router can reach — hook, statement x5 (the defect), feature, montage, stats,
// quote, body, cta — with the copy density a real 2-minute film carries.
const storyboard = {
  title: "Slash Time to Value",
  durationSec: 120,
  scenes: [
    { id: "s1", start: 0, duration: 7, kind: "hook", purpose: "hook", kicker: "EXPLAINER VIDEO", headline: "Slash Time|to Value", emphasis: "Time", subtext: "How the best SaaS teams cut weeks off the path to the aha moment." },
    { id: "s2", start: 7, duration: 8, kind: "feature", purpose: "feature", headline: "Show the product", subtext: "Real screens beat abstract promises every single time.", onScreenText: ["Live product UI", "Under 90 seconds", "One clear outcome"] },
    { id: "s3", start: 15, duration: 8, kind: "stat", purpose: "proof", headline: "The numbers move", emphasis: "72%", subtext: "72% faster activation", onScreenText: ["72% faster activation", "3x demo requests", "18 day payback"] },
    { id: "s4", start: 23, duration: 8, kind: "problem", purpose: "problem", headline: "ROI = TTV|Reduction", subtext: "Explainer video success is measured strictly by how fast viewers reach their aha moment.", onScreenText: ["Time to first value"] },
    { id: "s5", start: 31, duration: 7, kind: "quote", purpose: "quote", headline: "Ditch The Fluff", subtext: "Show Real Value", quote: "Ditch the fluff. Show real value." },
    { id: "s6", start: 38, duration: 8, kind: "feature", purpose: "feature", headline: "Slash TTV", subtext: "Cut the distance between curiosity and comprehension.", onScreenText: ["Reduce Time-to-Value to double your sales velocity", "Motion, not slides", "Built for 9:16"] },
    { id: "s7", start: 46, duration: 8, kind: "problem", purpose: "problem", headline: "One Problem", subtext: "One Outcome", onScreenText: ["Focus wins"] },
    { id: "s8", start: 54, duration: 8, kind: "showcase", purpose: "montage", headline: "Every angle", subtext: "The same story, told four ways.", onScreenText: ["Dashboard", "Mobile", "Reports", "Team"] },
    { id: "s9", start: 62, duration: 8, kind: "problem", purpose: "comparison", headline: "ClickUp &|Kitaabh AI", subtext: "Conversion Heroes", onScreenText: ["Two products, one lesson"] },
    { id: "s10", start: 70, duration: 8, kind: "feature", purpose: "how", headline: "How it lands", subtext: "Three moves that make a viewer stay.", onScreenText: ["Open on the pain", "Prove it on screen", "Close with one ask"] },
    { id: "s11", start: 78, duration: 8, kind: "stat", purpose: "proof", headline: "Measured, not felt", emphasis: "2.4x", subtext: "2.4x watch time", onScreenText: ["2.4x watch time", "41% lower CAC", "9 of 10 finish"] },
    { id: "s12", start: 86, duration: 8, kind: "body", purpose: "explain", headline: "Why it works", subtext: "A viewer decides in eight seconds whether the next eighty are worth it. Everything in the opening frame is spent buying that attention back.", body: "A viewer decides in eight seconds whether the next eighty are worth it." },
    { id: "s13", start: 94, duration: 8, kind: "problem", purpose: "problem", headline: "Stop explaining|Start showing", subtext: "The screenshot is the argument.", onScreenText: ["Show, do not tell"] },
    { id: "s14", start: 102, duration: 8, kind: "feature", purpose: "product", headline: "Built for vertical", subtext: "Nine by sixteen is not a cropped sixteen by nine.", onScreenText: ["Native 9:16", "Large assets", "Real motion"] },
    { id: "s15", start: 110, duration: 5, kind: "showcase", purpose: "gallery", headline: "See it run", subtext: "Four frames from a real film.", onScreenText: ["Hero", "Proof", "Feature", "Close"] },
    { id: "s16", start: 115, duration: 5, kind: "cta", purpose: "cta", headline: "Start your first film", subtext: "No card needed.", cta: "Get Started" },
  ],
};

// The real script schema (src/services/script.js) carries display copy in
// `onScreenText`; several beats also read `bullets`. Mirror one onto the other so
// the audit exercises both readers exactly as a shipped storyboard would.
for (const sc of storyboard.scenes) {
  if (Array.isArray(sc.onScreenText) && !sc.bullets) sc.bullets = sc.onScreenText.slice();
}

function copyAssets(dir) {
  const dst = path.join(dir, "assets", "images");
  fs.mkdirSync(dst, { recursive: true });
  const src = path.join(SRC, "assets", "images");
  const out = [];
  const add = (file, meta) => {
    if (!fs.existsSync(path.join(src, file))) return;
    fs.copyFileSync(path.join(src, file), path.join(dst, file));
    out.push({ path: `assets/images/${file}`, type: "image", visionOk: true, ...meta });
  };
  // The five REAL website captures — 2732x1800, ratio 1.518. These are the assets
  // that rendered unreadably in the shipped film.
  for (let i = 0; i < 5; i++) {
    add(`site_${i}.png`, {
      source: "website", kindHint: "screenshot", width: 2732, height: 1800, ratio: 2732 / 1800,
      alt: `REAL website screenshot - product UI ${i + 1}`, sourceUrl: "https://example.com/",
    });
  }
  // The article/brand images — 768x448 landscape and 1920x1080.
  for (let i = 0; i < 5; i++) {
    add(`siteimg_${i}.webp`, {
      source: "website", kindHint: "photo", width: i === 0 ? 1920 : 768, height: i === 0 ? 1080 : 448,
      ratio: i === 0 ? 1920 / 1080 : 768 / 448, alt: `Brand image ${i + 1} - testimonial still`,
    });
  }
  // A portrait photo and a square logo, to prove the fit logic on other shapes.
  add("3.jpg", { source: "pixabay", kindHint: "photo", width: 853, height: 1280, ratio: 853 / 1280, alt: "portrait photo - person at a desk" });
  add("6.jpg", { source: "pixabay", kindHint: "photo", width: 853, height: 1280, ratio: 853 / 1280, alt: "portrait photo - notebook and pen" });
  add("logo.png", { source: "upload", kindHint: "logo", width: 512, height: 512, ratio: 1, alt: "logo", role: "logo" });
  return out;
}

const PREVIEW_INJECT = `
<style>html,body{margin:0;background:#0d0d10;overflow:hidden}</style>
<script>
(function(){
  function fit(){
    var r=document.getElementById("root")||document.querySelector(".composition"); if(!r) return;
    var w=${W}, h=${H};
    r.style.position="fixed"; r.style.top="50%"; r.style.left="50%"; r.style.margin="0";
    r.style.width=w+"px"; r.style.height=h+"px"; r.style.transformOrigin="center center";
    var pad=32, s=Math.min((innerWidth-pad)/w,(innerHeight-pad)/h);
    r.style.transform="translate(-50%,-50%) scale("+s+")";
  }
  addEventListener("resize",fit); fit();
  (function wait(n){
    var tl=window.__timelines && window.__timelines["vid"];
    if(!tl){ if(n<250) return setTimeout(function(){wait(n+1);},60); return; }
    tl.eventCallback("onComplete", function(){ tl.play(0); }); tl.play(0);
    addEventListener("keydown", function(e){ if(e.code==="Space"){ e.preventDefault(); tl.paused()?tl.play():tl.pause(); }});
  })(0);
})();
</script>`;

function localGsap() {
  for (const p of [
    path.join(__dirname, "..", "node_modules", "gsap", "dist", "gsap.min.js"),
    path.join(__dirname, "..", "..", "web", "node_modules", "gsap", "dist", "gsap.min.js"),
    path.join(__dirname, "..", "showcase", "flagship", "gsap.min.js"),
  ]) { try { return fs.readFileSync(p, "utf8"); } catch { /* next */ } }
  return null;
}

// PREFER chrome-headless-shell. findChrome() returns the full Chrome build, and on this
// machine launching it with a fresh --user-data-dir still trips Chrome's singleton check
// ("The browser is already running for ..."), because a desktop Chrome is signed in and
// running. The headless shell has no singleton semantics and is the same renderer.
function headlessShell() {
  const os = require("node:os");
  const base = path.join(os.homedir(), ".cache", "puppeteer", "chrome-headless-shell");
  try {
    const dirs = fs.readdirSync(base).filter((d) => /^win64-|^linux64-|^mac/.test(d)).sort();
    for (const d of dirs.reverse()) {
      for (const leaf of ["chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-headless-shell-linux64/chrome-headless-shell", "chrome-headless-shell"]) {
        const p2 = path.join(base, d, leaf);
        if (fs.existsSync(p2)) return p2;
      }
    }
  } catch { /* fall through */ }
  return null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = headlessShell() || findChrome();
  if (!chrome) { console.error("no Chromium found"); process.exit(2); }
  console.log(`chrome: ${chrome}`);
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true,
    userDataDir: require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "fpa-")),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", `--window-size=${W},${H}`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

  for (const skinName of SKINS) {
    const dir = path.join(OUT, `${TAG}__${skinName}`);
    fs.mkdirSync(dir, { recursive: true });
    const assets = copyAssets(dir);
    const mod = require(path.join("..", "src", "services", "film_skins", `${skinName}.js`));
    const comp = mod.buildComposition({
      storyboard, dims: { width: W, height: H, fps: 30 },
      assets, seedKey: "audit-fixed-seed",
    });
    const html = comp.indexHtml || comp.html || comp;
    fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
    const g = localGsap();
    let prev = html;
    if (g) prev = prev.replace(/<script\s+src="https?:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"]*"><\/script>/i, "<script>" + g + "</scr" + "ipt>");
    fs.writeFileSync(path.join(dir, "preview.html"), prev.replace(/<\/body>/i, PREVIEW_INJECT + "\n</body>"), "utf8");

    const url = "file://" + path.join(dir, "index.html").replace(/\\/g, "/");
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
    const ok = await page.waitForFunction(() => !!(window.__timelines && window.__timelines["vid"]), { timeout: 20000, polling: 300 }).then(() => true).catch(() => false);
    if (!ok) { console.warn(`${skinName}: NO TIMELINE`); continue; }
    await page.evaluate((w, h) => {
      document.documentElement.style.margin = "0"; document.body.style.margin = "0";
      const root = document.querySelector("#root") || document.querySelector(".composition");
      if (root) { root.style.width = w + "px"; root.style.height = h + "px"; }
    }, W, H);
    // Report the beat each scene actually drew, straight off the DOM.
    const beats = await page.evaluate(() => [...document.querySelectorAll(".fk-sc")].map((e) => ({
      id: e.id, beat: e.getAttribute("data-fk-beat"), ground: e.getAttribute("data-fk-ground"),
      start: +e.getAttribute("data-start"), dur: +e.getAttribute("data-duration"),
    })));
    fs.writeFileSync(path.join(dir, "beats.json"), JSON.stringify(beats, null, 2));
    console.log(`\n== ${skinName} ==`);
    for (const b of beats) console.log(`  ${b.id.padEnd(5)} ${String(b.beat).padEnd(11)} ${b.ground}  @${b.start}s +${b.dur}s`);

    // MEASURE, DO NOT EYEBALL. For each scene: the union box of everything the beat draws,
    // the largest picture in it, and the empty band under the content — the three numbers the
    // whole redesign is judged on.
    const metrics = [];
    for (const b of beats) {
      if (ONLY && !ONLY.split(",").includes(b.id)) continue;
      const t = b.start + b.dur * 0.5;                  // mid-scene: past every entrance, before any camera exit
      await page.evaluate((tt) => { const tl = window.__timelines["vid"]; tl.pause(); tl.time(tt, false); }, t);
      await new Promise((r) => setTimeout(r, 260));
      const out = path.join(OUT, `${TAG}__${skinName}__${b.id}_${b.beat}.png`);
      await page.screenshot({ path: out });
      const m = await page.evaluate((id, W2, H2) => {
        const root = document.getElementById(id);
        if (!root) return null;
        const vis = (e) => {
          const cs = getComputedStyle(e);
          if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) return false;
          const r = e.getBoundingClientRect();
          return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < H2;
        };
        let top = Infinity, bot = -Infinity, left = Infinity, right = -Infinity;
        let img = null;
        for (const e of root.querySelectorAll("div,span,img,svg")) {
          const txt = e.tagName === "IMG" || e.tagName === "SVG" || (e.children.length === 0 && e.textContent.trim());
          const chip = e.getAttribute("style") && /background:/.test(e.getAttribute("style")) && e.children.length <= 2;
          if (!txt && !chip) continue;
          if (!vis(e)) continue;
          const r = e.getBoundingClientRect();
          top = Math.min(top, r.top); bot = Math.max(bot, r.bottom);
          left = Math.min(left, r.left); right = Math.max(right, r.right);
          if (e.tagName === "IMG") {
            const a = r.width * r.height;
            if (!img || a > img.a) img = { a, w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), b: Math.round(r.bottom) };
          }
        }
        if (!isFinite(top)) return null;
        return {
          top: Math.round(top), bot: Math.round(bot), left: Math.round(left), right: Math.round(right),
          img, W: W2, H: H2,
        };
      }, b.id, W, H).catch(() => null);
      if (m) {
        const pc = (v) => ((v / H) * 100).toFixed(1);
        metrics.push({
          id: b.id, beat: b.beat,
          contentTop: +pc(m.top), contentBot: +pc(Math.min(m.bot, H)),
          span: +(pc(Math.min(m.bot, H)) - pc(m.top)).toFixed(1),
          voidBelow: +(100 - pc(Math.min(m.bot, H))).toFixed(1),
          imgWpc: m.img ? +((m.img.w / W) * 100).toFixed(1) : 0,
          imgHpc: m.img ? +((m.img.h / H) * 100).toFixed(1) : 0,
          imgAreaPc: m.img ? +(((m.img.w * m.img.h) / (W * H)) * 100).toFixed(1) : 0,
          imgTop: m.img ? +pc(m.img.t) : null,
        });
      }
    }
    fs.writeFileSync(path.join(OUT, `_metrics_${TAG}.json`), JSON.stringify(metrics, null, 2));
    console.log("");
    console.log("  scene  beat        content%      span  void   img w%  h%  area%  imgTop%");
    for (const m of metrics) {
      console.log(`  ${m.id.padEnd(5)} ${String(m.beat).padEnd(11)} ${String(m.contentTop).padStart(5)}->${String(m.contentBot).padStart(5)} ${String(m.span).padStart(6)} ${String(m.voidBelow).padStart(5)} ${String(m.imgWpc).padStart(7)} ${String(m.imgHpc).padStart(5)} ${String(m.imgAreaPc).padStart(6)} ${String(m.imgTop == null ? "-" : m.imgTop).padStart(8)}`);
    }
    console.log(`  -> ${OUT}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
