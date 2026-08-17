// Dense A/B measurement of the kinetic script layer.
//  - samples every SAMPLE_SEC across the film, both ways
//  - per sample: which spoken words of the CURRENT cue are visible on screen
//    (from the film's own text) and whether the overlay box collides with a
//    template text box, with the collided area
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const om = require("../src/services/omelette_adapter.js");

const PACKS = process.argv.slice(2).length ? process.argv.slice(2) : ["teampulse"];
const OUT = "C:/Users/kalua/AppData/Local/Temp/claude/c--internship-KEYFRAME/bd5b10bb-dfaa-4541-9610-910ddee22d32/scratchpad/ab2";
const JOBDIR = "C:/internship/KEYFRAME/server/jobs/9bytvxqh7c";
const STEP = 0.5;

const SRC = [
  { id: "s1", start: 0, duration: 4.6, kind: "hook", purpose: "hook", headline: "Work scattered everywhere",
    subtext: "Email, chats and lists pull your team apart.", bullets: ["Email", "Chats", "Lists"],
    voiceover: "Your work is scattered across email, chats and half-finished lists." },
  { id: "s2", start: 4.6, duration: 5.2, kind: "feature", purpose: "feature", headline: "One visual place",
    subtext: "Capture, organize and tackle every to-do.", bullets: ["Boards", "Cards"],
    voiceover: "Trello puts every to-do in one visual place you can actually see." },
  { id: "s3", start: 9.8, duration: 4.4, kind: "feature", purpose: "feature", headline: "Automation built in",
    subtext: "No-code rules do the busywork.", bullets: ["Rules", "Buttons"],
    voiceover: "No-code automation handles the busywork for you." },
  { id: "s4", start: 14.2, duration: 4.8, kind: "cta", purpose: "cta", headline: "Start today",
    subtext: "Free to try.", cta: "Get Trello free",
    voiceover: "Start today. Trello is free to try." },
];
const TOTAL = SRC.reduce((a, s) => a + s.duration, 0);
const STOP = new Set(["a","an","the","of","to","in","on","for","and","or","is","are","it","you","your","can","with","across","every","half","at","be","this","that"]);
const norm = (s) => String(s).toLowerCase().replace(/[^\w\s'-]/g, " ").split(/\s+/).filter(Boolean);

function assetsFrom(dir) {
  const d = path.join(dir, "assets/images");
  const A = [];
  for (const f of fs.readdirSync(d)) {
    if (/\.svg$/i.test(f)) { A.push({ path: `assets/images/${f}`, type: "image", source: "iconify", alt: "a topical vector", visionOk: true }); continue; }
    if (/^(page_|site_)/i.test(f)) { A.push({ path: `assets/images/${f}`, type: "image", source: "website", kind: "screenshot", width: 2732, height: 1800, ratio: 1.518, alt: `REAL screenshot of ${f}`, cdScore: 88, cdProminence: "hero", visionOk: true }); continue; }
    A.push({ path: `assets/images/${f}`, type: "image", source: "pixabay", width: 1920, height: 1080, ratio: 1.78, alt: "a stock photo", cdScore: 55, cdProminence: "support", visionOk: true });
  }
  return A;
}

async function build(pack, mode) {
  const dir = `${OUT}/${pack}-${mode}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(`${JOBDIR}/assets`, `${dir}/assets`, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(`C:/internship/KEYFRAME/frames/${pack}/pack.json`, "utf8"));
  const cues = SRC.map((s) => ({ start: s.start, end: s.start + s.duration, text: s.voiceover }));
  const built = om.buildComposition({
    storyboard: { title: "Trello", brand: "Trello", url: "trello.com", durationSec: TOTAL, scenes: SRC },
    dims: { width: 1080, height: 1920, fps: 30 }, framePack: pack, assets: assetsFrom(dir), manifest,
    scriptCues: cues, scriptOverlay: mode === "on",
  });
  fs.writeFileSync(`${dir}/index.html`, built.indexHtml);
  return { dir, html: built.indexHtml };
}

const PROBE = () => {
  const rr = (document.getElementById("kf-comp-root") || document.body).getBoundingClientRect();
  const kfs = document.getElementById("kf-script");
  let ph = null;
  if (kfs) for (const el of kfs.querySelectorAll(".kf-ph")) {
    if (el.style.display === "block") {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      ph = { text: el.textContent.trim(), top: r.top - rr.top, bottom: r.bottom - rr.top,
             left: r.left - rr.left, right: r.right - rr.left, fontPx: parseFloat(cs.fontSize), color: cs.color };
      break;
    }
  }
  const boxes = []; let filmText = "";
  const walk = (node) => {
    for (const n of node.querySelectorAll("*")) {
      if (n.shadowRoot) walk(n.shadowRoot);
      if (kfs && kfs.contains(n)) continue;
      const isImg = ["IMG", "SVG", "VIDEO", "CANVAS"].includes(n.tagName);
      let txt = "";
      for (const c of n.childNodes) if (c.nodeType === 3 && c.textContent.trim()) txt += c.textContent.trim() + " ";
      if (!isImg && !txt) continue;
      const cs = getComputedStyle(n);
      if (cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.12) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 20 || r.height < 12) continue;
      if (r.bottom < rr.top || r.top > rr.bottom) continue;   // off the frame
      if (txt) filmText += txt + " ";
      boxes.push({ kind: isImg ? "img" : "text", txt: txt.trim().slice(0, 60), fontPx: isImg ? 0 : parseFloat(cs.fontSize),
        top: r.top - rr.top, bottom: r.bottom - rr.top, left: r.left - rr.left, right: r.right - rr.left });
    }
  };
  walk(document);
  return { ph, boxes, filmText, W: rr.width, H: rr.height };
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"],
  });
  for (const pack of PACKS) {
    const summary = {};
    for (const mode of ["off", "on"]) {
      const b = await build(pack, mode);
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
      await page.goto("file:///" + path.resolve(`${b.dir}/index.html`).replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 90000 });
      await new Promise((r) => setTimeout(r, 2000));
      let samples = 0, withPhrase = 0, collided = 0, collArea = 0, covSum = 0, minFont = 1e9, dupSum = 0, dupN = 0;
      const union = new Set();
      const worst = [];
      for (let t = 0.25; t < TOTAL; t += STEP) {
        await page.evaluate((tt) => { const tl = (window.__timelines || {}).vid; if (tl) tl.time(tt); }, +t.toFixed(2));
        await new Promise((r) => setTimeout(r, 240));
        const st = await page.evaluate(PROBE);
        const cue = SRC.find((s) => t >= s.start && t < s.start + s.duration) || SRC[SRC.length - 1];
        const spoken = norm(cue.voiceover).filter((w) => !STOP.has(w));
        const onScreen = new Set(norm(st.filmText + " " + (st.ph ? st.ph.text : "")));
        const cov = spoken.length ? spoken.filter((w) => onScreen.has(w)).length / spoken.length : 1;
        covSum += cov; samples++;
        for (const w of norm(st.filmText + ' ' + (st.ph ? st.ph.text : ''))) union.add(w);
        if (st.ph) {
          withPhrase++; minFont = Math.min(minFont, st.ph.fontPx);
          // DUPLICATION: how much of the phrase is already on the frame in the
          // template's own type at this instant?
          const pw = norm(st.ph.text).filter((w) => !STOP.has(w));
          const fw = new Set(norm(st.filmText));
          dupSum += pw.length ? pw.filter((w) => fw.has(w)).length / pw.length : 0;
          dupN++;
          const area = Math.max(1, (st.ph.bottom - st.ph.top) * (st.ph.right - st.ph.left));
          let hit = 0, worstTxt = "";
          for (const bx of st.boxes) {
            if (bx.kind !== "text") continue;
            const oy = Math.min(st.ph.bottom, bx.bottom) - Math.max(st.ph.top, bx.top);
            const ox = Math.min(st.ph.right, bx.right) - Math.max(st.ph.left, bx.left);
            if (oy > 4 && ox > 4) { const a = oy * ox; if (a > hit) { hit = a; worstTxt = `${bx.txt} @${Math.round(bx.fontPx)}px`; }
            }
          }
          if (hit > 0) { collided++; collArea += hit / area; worst.push({ t: +t.toFixed(2), pct: Math.round(100 * hit / area), phrase: st.ph.text, over: worstTxt }); }
        }
      }
      const allSpoken = SRC.flatMap((x) => norm(x.voiceover));
      const allContent = allSpoken.filter((w) => !STOP.has(w));
      summary[mode] = { samples, withPhrase, collided, meanCoverage: covSum / samples, dup: dupN ? dupSum / dupN : 0,
        unionAll: allSpoken.filter((w) => union.has(w)).length / allSpoken.length,
        unionContent: allContent.filter((w) => union.has(w)).length / allContent.length,
        meanCollFrac: collided ? collArea / collided : 0, minFont: minFont === 1e9 ? null : minFont,
        worst: worst.sort((a, b) => b.pct - a.pct).slice(0, 6) };
      await page.close();
    }
    console.log(`\n===== ${pack} =====`);
    for (const mode of ["off", "on"]) {
      const s = summary[mode];
      console.log(`[${mode}] samples=${s.samples} framesWithOverlayPhrase=${s.withPhrase} ` +
        `meanSpokenWordCoverage=${(100 * s.meanCoverage).toFixed(0)}% ` +
        `collidingFrames=${s.collided}${s.withPhrase ? ` (${Math.round(100 * s.collided / s.withPhrase)}% of overlay frames)` : ""} ` +
        `meanCollidedAreaOfPhrase=${(100 * s.meanCollFrac).toFixed(0)}% minFont=${s.minFont}px meanPhraseWordsAlreadyOnFrame=${(100 * s.dup).toFixed(0)}% UNION-of-whole-film: allWords=${(100 * s.unionAll).toFixed(0)}% contentWords=${(100 * s.unionContent).toFixed(0)}%`);
      for (const w of s.worst) console.log(`      t=${w.t} "${w.phrase}" ${w.pct}% covered by template text: ${w.over}`);
    }
  }
  await browser.close();
})();
