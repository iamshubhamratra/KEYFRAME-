// Same A/B on the FAMILY path (template_engine), where the overlay has NO
// dynamic placement — it is pinned bottom:9% (landscape) / top:20% (portrait).
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const composer = require("../src/services/family_poster.js");

const PACK = process.argv[2] || "blockframe";
const LAND = process.argv[3] !== "portrait";
const OUT = "C:/Users/kalua/AppData/Local/Temp/claude/c--internship-KEYFRAME/bd5b10bb-dfaa-4541-9610-910ddee22d32/scratchpad/fam";
const JOBDIR = "C:/internship/KEYFRAME/server/jobs/9bytvxqh7c";

const SRC = [
  { id: "s1", start: 0, duration: 4.6, kind: "hook", purpose: "hook", headline: "Work scattered everywhere",
    subtext: "Email, chats and lists pull your team apart.", bullets: ["Email", "Chats", "Lists"],
    voiceover: "Your work is scattered across email, chats and half-finished lists." },
  { id: "s2", start: 4.6, duration: 5.2, kind: "feature", purpose: "feature", headline: "One visual place",
    subtext: "Capture, organize and tackle every to-do.", bullets: ["Boards", "Cards"],
    voiceover: "Trello puts every to-do in one visual place you can actually see." },
  { id: "s3", start: 9.8, duration: 4.4, kind: "cta", purpose: "cta", headline: "Start today",
    subtext: "Free to try.", cta: "Get Trello free", voiceover: "Start today. Trello is free to try." },
];
const TOTAL = SRC.reduce((a, s) => a + s.duration, 0);

function assetsFrom(dir) {
  const d = path.join(dir, "assets/images");
  return fs.readdirSync(d).filter((f) => !/\.svg$/i.test(f)).map((f) => ({
    path: `assets/images/${f}`, type: "image", source: /^(page_|site_)/i.test(f) ? "website" : "pixabay",
    kind: /^(page_|site_)/i.test(f) ? "screenshot" : undefined,
    width: 1920, height: 1080, ratio: 1.78, alt: "an image", cdScore: 70, visionOk: true,
  }));
}

(async () => {
  const W = LAND ? 1920 : 1080, H = LAND ? 1080 : 1920;
  const cues = SRC.map((s) => ({ start: s.start, end: s.start + s.duration, text: s.voiceover }));
  const dirs = {};
  for (const mode of ["off", "on"]) {
    const dir = `${OUT}/${PACK}-${mode}`;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(`${JOBDIR}/assets`, `${dir}/assets`, { recursive: true });
    const built = composer.buildComposition({
      storyboard: { title: "Trello", brand: "Trello", url: "trello.com", durationSec: TOTAL, scenes: SRC },
      dims: { width: W, height: H, fps: 30 }, framePack: PACK, assets: assetsFrom(dir),
      captionCues: cues, scriptCues: cues, scriptOverlay: mode === "on",
      manifest: JSON.parse(fs.readFileSync(`C:/internship/KEYFRAME/frames/${PACK}/pack.json`, "utf8")),
    });
    fs.writeFileSync(`${dir}/index.html`, built.indexHtml);
    dirs[mode] = dir;
    console.log(`[${mode}] kf-ph nodes in html: ${(built.indexHtml.match(/class="kf-ph"/g) || []).length}`);
  }
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"],
  });
  const times = [1.5, 3.5, 6.5, 8.5, 11.5, 13];
  for (const mode of ["off", "on"]) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.goto("file:///" + path.resolve(`${dirs[mode]}/index.html`).split(path.sep).join("/"), { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    for (let i = 0; i < times.length; i++) {
      await page.evaluate((t) => { const tl = (window.__timelines || {}).vid; if (tl) { tl.pause(); tl.time(t); } }, times[i]);
      await new Promise((r) => setTimeout(r, 250));
      await page.screenshot({ path: `${dirs[mode]}/f${i}.png` });
      const st = await page.evaluate(() => {
        const kfs = document.getElementById("kf-script");
        let ph = null;
        if (kfs) for (const el of kfs.querySelectorAll(".kf-ph")) if (getComputedStyle(el).display !== "none") {
          const r = el.getBoundingClientRect(); ph = { t: el.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), font: getComputedStyle(el).fontSize, color: getComputedStyle(el.querySelector("span") || el).color }; break;
        }
        const boxes = [];
        for (const n of document.querySelectorAll("*")) {
          if (kfs && kfs.contains(n)) continue;
          let txt = ""; for (const c of n.childNodes) if (c.nodeType === 3 && c.textContent.trim()) txt += c.textContent.trim() + " ";
          if (!txt) continue;
          const cs = getComputedStyle(n); if (cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.12) continue;
          const r = n.getBoundingClientRect(); if (r.width < 30 || r.height < 14) continue;
          boxes.push({ txt: txt.trim().slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), font: cs.fontSize });
        }
        return { ph, boxes };
      });
      let ov = [];
      if (st.ph) for (const b of st.boxes) {
        const oy = Math.min(st.ph.bottom, b.bottom) - Math.max(st.ph.top, b.top);
        if (oy > 4) ov.push(b);
      }
      console.log(`[${mode}] t=${times[i]}` + (st.ph ? ` "${st.ph.t}" @${st.ph.top}-${st.ph.bottom} ${st.ph.font} ${st.ph.color} | vertical-band overlaps: ${ov.map((o) => `"${o.txt}"@${o.font}`).join(", ") || "none"}` : " (no phrase)"));
    }
    await page.close();
  }
  await browser.close();
  console.log("out:", OUT);
})();
