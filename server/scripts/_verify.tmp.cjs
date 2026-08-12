// Render the pack that shipped broken, with that job's real assets, and check
// for (a) the engine error slate, (b) the full-frame script overlay.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const om = require("../src/services/omelette_adapter.js");

const PACK = process.argv[2] || "bluesite";
const OUT = "C:/Users/kalua/AppData/Local/Temp/claude/C--internship-KEYFRAME/5f370742-6bfa-4061-83ad-460b407215df/scratchpad/verify";
const JOBDIR = "C:/internship/KEYFRAME/server/jobs/5i94yvz5fv";

// The shape that broke it: real narration, long sentences, no short bullets.
const SRC = [
  { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "hook", headline: "Need it all today?", subtext: "Everything you want, in one place.", voiceover: "Need it all today? Everything you want lives in one place." },
  { id: "s2", start: 4, duration: 4, kind: "context", purpose: "context", headline: "India's ultimate one-stop destination for everything you need", subtext: "Fashion, electronics, groceries and more across one app.", voiceover: "India's ultimate one stop destination for everything you need." },
  { id: "s3", start: 8, duration: 4, kind: "feature", purpose: "feature", headline: "Millions of products", subtext: "Browse categories that cover the whole home.", voiceover: "Millions of products across every category you can think of." },
  { id: "s4", start: 12, duration: 4, kind: "stat", purpose: "proof", headline: "Trusted at scale", subtext: "Seventy five percent of shoppers return within thirty days.", stats: [{ value: "75%", label: "return in 30 days" }], voiceover: "Seventy five percent of shoppers come back within thirty days." },
  { id: "s5", start: 16, duration: 4, kind: "how", purpose: "how", headline: "Pay your way", subtext: "Wallet, cards and cash on delivery all supported.", voiceover: "Pay your way with wallet, cards or cash on delivery." },
  { id: "s6", start: 20, duration: 4, kind: "feature", purpose: "feature", headline: "Fast delivery", subtext: "Ships to your door in days, not weeks.", voiceover: "It ships to your door in days, not weeks." },
  { id: "s7", start: 24, duration: 4, kind: "proof", purpose: "proof", headline: "Loved by shoppers", subtext: "Rated highly across the country every single day.", voiceover: "Shoppers across the country rate it highly every day." },
  { id: "s8", start: 28, duration: 4, kind: "context", purpose: "context", headline: "One app for everything", subtext: "No more hopping between five different stores.", voiceover: "One app for everything, instead of five different stores." },
  { id: "s9", start: 32, duration: 4, kind: "cta", purpose: "cta", headline: "Start shopping", subtext: "Free to browse.", cta: "Open the app", voiceover: "Start shopping today. It is free to browse." },
];

function assetsFrom(dir) {
  const d = path.join(dir, "assets/images");
  const files = fs.readdirSync(d);
  const A = [];
  for (const f of files) {
    if (/^logo\./i.test(f)) { A.push({ path: `assets/images/${f}`, type: "image", kind: "logo", alt: "logo", source: "website" }); continue; }
    if (/\.svg$/i.test(f)) { A.push({ path: `assets/images/${f}`, type: "image", source: "iconify", alt: "a topical vector", visionOk: true }); continue; }
    if (/^(page_|site_)/i.test(f)) { A.push({ path: `assets/images/${f}`, type: "image", source: "website", kind: "screenshot", width: 2732, height: 1800, ratio: 1.518, alt: `REAL screenshot of the ${f.replace(/[_-]/g, " ").replace(/\.\w+$/, "")} page`, cdScore: 85, cdProminence: "hero", visionOk: true }); continue; }
    if (/^siteimg_/i.test(f)) { A.push({ path: `assets/images/${f}`, type: "image", source: "website-image", width: 1200, height: 800, ratio: 1.5, alt: "an image from the site", cdScore: 70, cdProminence: "support", visionOk: true }); continue; }
    A.push({ path: `assets/images/${f}`, type: "image", source: "pixabay", width: 1920, height: 1080, ratio: 1.78, alt: "a stock photo", cdScore: 55, cdProminence: "support", visionOk: true });
  }
  return A;
}

function beatsOf(html) {
  const t = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!t) return [];
  let page; try { page = JSON.parse(t[1]); } catch { return []; }
  const m = /window\.OM_SCENES\s*=\s*('[\s\S]*?'|"[\s\S]*?")\s*;/.exec(page);
  if (!m) return [];
  try { const l = m[1]; return JSON.parse(l[0] === "'" ? l.slice(1, -1) : JSON.parse(l)).map((s) => Number(s.dur) || 0).filter((d) => d > 0); }
  catch { return []; }
}

(async () => {
  const dir = `${OUT}/${PACK}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(`${JOBDIR}/assets`, `${dir}/assets`, { recursive: true });
  const assets = assetsFrom(dir);
  const manifest = JSON.parse(fs.readFileSync(`C:/internship/KEYFRAME/frames/${PACK}/pack.json`, "utf8"));
  const cues = SRC.map((s) => ({ start: s.start, end: s.start + s.duration, text: s.voiceover }));
  const built = om.buildComposition({
    storyboard: { title: "Flipkart", brand: "Flipkart", url: "flipkart.com", durationSec: 36, scenes: SRC },
    dims: { width: 1080, height: 1920, fps: 30 }, framePack: PACK, assets, manifest,
    scriptCues: cues,                       // supplied, but not requested -> must NOT render
  });
  fs.writeFileSync(`${dir}/index.html`, built.indexHtml);

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await page.goto("file:///" + path.resolve(`${dir}/index.html`).replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1500));

  const beats = beatsOf(built.indexHtml);
  const times = []; { let t = 0; for (const d of beats) { times.push(+(t + d / 2).toFixed(2)); t += d; } }
  const rows = []; const seen = new Set();
  for (let i = 0; i < times.length; i++) {
    await page.evaluate((tt) => { const tl = (window.__timelines || {}).vid; if (tl) tl.time(tt); }, times[i]);
    await new Promise((r) => setTimeout(r, 320));
    await page.screenshot({ path: `${dir}/b${String(i).padStart(2, "0")}.png` });
    const st = await page.evaluate(() => {
      const txt = document.body.innerText || "";
      let imgs = 0, painted = 0; const srcs = [];
      const walk = (root) => { for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
        if (el.tagName !== "IMG") continue;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.width < 8 || r.height < 8) continue; imgs++;
        if (el.complete && el.naturalWidth && Number(cs.opacity) > 0.5 && cs.visibility !== "hidden") { painted++; srcs.push(String(el.currentSrc || el.src).split("/").pop()); }
      } };
      walk(document);
      return { imgs, painted, srcs, words: txt.trim().split(/\s+/).filter(Boolean).length,
        crash: /is not a function|is not defined|Cannot read|undefined is not/.test(txt),
        overlayNodes: document.querySelectorAll("#kf-script,#kf-script-holder,.kf-sc-ph").length };
    });
    st.srcs.forEach((x) => seen.add(x));
    rows.push({ t: times[i], ...st });
  }
  await browser.close();

  const cls = (f) => /\.svg$/i.test(f) ? "vector" : /^(page_|site_\d)/i.test(f) ? "screenshot" : /^siteimg_/i.test(f) ? "site-image" : /^logo\./i.test(f) ? "logo" : "pixabay";
  const tally = {};
  for (const f of seen) tally[cls(f)] = (tally[cls(f)] || 0) + 1;
  console.log(`\n${PACK} — ${rows.length} beats`);
  console.log("beat     t   imgs painted words  crash  overlayNodes");
  rows.forEach((r, i) => console.log(`${String(i).padStart(3)} ${String(r.t).padStart(6)} ${String(r.imgs).padStart(5)} ${String(r.painted).padStart(6)} ${String(r.words).padStart(6)}  ${r.crash ? "CRASH" : "  ok "}  ${String(r.overlayNodes).padStart(6)}`));
  const crashed = rows.filter((r) => r.crash).length;
  const overlaid = rows.filter((r) => r.overlayNodes > 0).length;
  console.log(`\ncrashed beats: ${crashed}/${rows.length}   |   beats carrying the script overlay: ${overlaid}/${rows.length}`);
  console.log("distinct assets on screen:", JSON.stringify(tally));
  if (errs.length) console.log("PAGE ERRORS:", errs.slice(0, 3).join(" | "));
  console.log(`frames: ${dir}`);
})();
