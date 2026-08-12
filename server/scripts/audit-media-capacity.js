// RENDERED asset capacity per pack — the honest number.
//
// Counting paths in OM_SCENES overcounts badly: the adapter writes `shot`/`image`
// onto every scene whether or not that shape draws a picture, so a template with
// one photo shape still reports a full payload. This renders each film in Chrome
// and counts the <img> elements that actually PAINT, per beat.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const om = require("../src/services/omelette_adapter.js");

const OUT = "C:/Users/kalua/AppData/Local/Temp/claude/C--internship-KEYFRAME/5f370742-6bfa-4061-83ad-460b407215df/scratchpad/rendercap";
const JOBDIR = "C:/internship/KEYFRAME/server/jobs/5i94yvz5fv";
const SAMPLE = Number(process.argv[2] || 999);
const SAVE = process.argv.includes("--save");

const KIND = ["hook", "context", "feature", "stat", "how", "feature", "proof", "context", "cta"];
const SRC = Array.from({ length: 9 }, (_, i) => ({
  id: `s${i + 1}`, start: i * 4, duration: 4, kind: KIND[i], purpose: KIND[i],
  headline: ["Need it all today?", "One destination", "Millions of products", "Trusted at scale",
    "Pay your way", "Fast delivery", "Loved by shoppers", "One app for everything", "Start shopping"][i],
  subtext: "Everything you want, in one place, without the hopping between stores.",
  onScreenText: ["Browse", "Compare", "Buy"], bullets: ["Browse it", "Compare it", "Buy it"],
  stats: [{ value: "75%", label: "return in 30 days" }], cta: "Open the app",
  voiceover: "Everything you want, in one place, without hopping between stores.",
}));

function assetsFrom(dir) {
  const d = path.join(dir, "assets/images");
  const A = [];
  for (const f of fs.readdirSync(d)) {
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
  const dir = `${OUT}/_assets`;
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(`${JOBDIR}/assets`, `${dir}/assets`, { recursive: true });
  const assets = assetsFrom(dir);

  const FR = "C:/internship/KEYFRAME/frames";
  const packs = fs.readdirSync(FR).filter((d) => {
    try { return JSON.parse(fs.readFileSync(path.join(FR, d, "pack.json"), "utf8")).renderer === "omelette"; } catch { return false; }
  });
  const step = Math.max(1, Math.floor(packs.length / SAMPLE));
  const picked = packs.filter((_, i) => i % step === 0).slice(0, SAMPLE);

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"],
  });
  const rows = [];
  for (const p of picked) {
    const pd = `${OUT}/${p}`;
    fs.mkdirSync(pd, { recursive: true });
    fs.symlinkSync?.length; // noop
    fs.cpSync(`${dir}/assets`, `${pd}/assets`, { recursive: true });
    let built;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(FR, p, "pack.json"), "utf8"));
      built = om.buildComposition({
        storyboard: { title: "Flipkart", brand: "Flipkart", url: "flipkart.com", durationSec: 36, scenes: SRC },
        dims: { width: 1080, height: 1920, fps: 30 }, framePack: p, assets: assets.map((a) => ({ ...a })), manifest,
      });
    } catch (e) { rows.push({ pack: p, err: String(e.message).slice(0, 40) }); continue; }
    fs.writeFileSync(`${pd}/index.html`, built.indexHtml);
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    let crashed = 0;
    try {
      await page.goto("file:///" + path.resolve(`${pd}/index.html`).replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 900));
      const beats = beatsOf(built.indexHtml);
      const times = []; { let t = 0; for (const d of beats) { times.push(+(t + d / 2).toFixed(2)); t += d; } }
      const seen = new Set(); let mediaBeats = 0;
      for (const tt of times) {
        await page.evaluate((x) => { const tl = (window.__timelines || {}).vid; if (tl) tl.time(x); }, tt);
        await new Promise((r) => setTimeout(r, 220));
        const st = await page.evaluate(() => {
          const out = { srcs: [], crash: /is not a function|is not defined|Cannot read/.test(document.body.innerText || "") };
          const walk = (root) => { for (const el of root.querySelectorAll("*")) {
            if (el.shadowRoot) walk(el.shadowRoot);
            if (el.tagName !== "IMG") continue;
            const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
            if (r.width < 40 || r.height < 40) continue;
            if (el.complete && el.naturalWidth && Number(cs.opacity) > 0.5 && cs.visibility !== "hidden") out.srcs.push(String(el.currentSrc || el.src).split("/").pop());
          } };
          walk(document); return out;
        });
        if (st.crash) crashed++;
        if (st.srcs.length) mediaBeats++;
        st.srcs.forEach((s) => seen.add(decodeURIComponent(s)));
      }
      const cls = (f) => /\.svg$/i.test(f) ? "vec" : /^(page_|site_\d)/i.test(f) ? "shot" : /^siteimg_/i.test(f) ? "siteimg" : /^logo\./i.test(f) ? "logo" : /^data:|^svg\+xml/i.test(f) ? "gen" : "pix";
      const t = { shot: 0, siteimg: 0, pix: 0, vec: 0 };
      for (const f of seen) if (t[cls(f)] !== undefined) t[cls(f)]++;
      rows.push({ pack: p, beats: times.length, mediaBeats, crashed, ...t, total: t.shot + t.siteimg + t.pix + t.vec });
    } catch (e) { rows.push({ pack: p, err: String(e.message).slice(0, 40) }); }
    await page.close();
  }
  await browser.close();

  console.log(`\nRENDERED ASSET CAPACITY — ${rows.length} omelette packs, 9-scene film, 17 real assets supplied`);
  console.log("(distinct images that actually PAINT)\n");
  console.log("pack".padEnd(24), "beats", "media", "shots", "siteimg", "pix", "vec", "total", "crash");
  console.log("-".repeat(84));
  const ok = rows.filter((r) => !r.err).sort((a, b) => b.total - a.total);
  for (const r of ok) {
    console.log(r.pack.padEnd(24), String(r.beats).padStart(5), String(r.mediaBeats).padStart(5),
      String(r.shot).padStart(5), String(r.siteimg).padStart(7), String(r.pix).padStart(3),
      String(r.vec).padStart(4), String(r.total).padStart(5), String(r.crashed).padStart(5));
  }
  for (const r of rows.filter((x) => x.err)) console.log(r.pack.padEnd(24), "ERROR", r.err);
  const m = ok.reduce((a, r) => a + r.total, 0) / (ok.length || 1);
  const mb = ok.reduce((a, r) => a + r.mediaBeats / r.beats, 0) / (ok.length || 1);
  console.log("-".repeat(84));
  console.log(`mean ${m.toFixed(1)} distinct images on screen; ${(mb * 100).toFixed(0)}% of beats carry media; total crashed beats: ${ok.reduce((a, r) => a + r.crashed, 0)}`);
  fs.writeFileSync(`${OUT}/capacity.json`, JSON.stringify(ok, null, 1));
  if (SAVE) {
    const BASE = "C:/internship/KEYFRAME/server/framecheck/media-capacity.json";
    const map = {}; for (const r of ok) map[r.pack] = { images: r.total, mediaBeats: r.mediaBeats, beats: r.beats, shots: r.shot };
    fs.mkdirSync(require("path").dirname(BASE), { recursive: true });
    fs.writeFileSync(BASE, JSON.stringify({ measuredWith: "9-scene film, 17 real assets", packs: map }, null, 1));
    console.log("saved ->", BASE);
  }
  console.log(`json: ${OUT}/capacity.json`);
})();
