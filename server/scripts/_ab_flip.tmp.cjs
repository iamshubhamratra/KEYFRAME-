// A/B the kinetic script layer on ONE vertical omelette pack.
// Renders the SAME composition twice — scriptOverlay:false (shipped default)
// and scriptOverlay:true (the standing rule) — and screenshots each beat.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const om = require("C:/internship/KEYFRAME/server/src/services/omelette_adapter.js");

const PACK = process.argv[2] || "teampulse";
const OUT = "C:/Users/kalua/AppData/Local/Temp/claude/c--internship-KEYFRAME/bd5b10bb-dfaa-4541-9610-910ddee22d32/scratchpad/ab";
const JOBDIR = "C:/internship/KEYFRAME/server/jobs/9bytvxqh7c";

// Same fixture the gate uses (check-script-coverage.js), so numbers line up.
const SRC = [
  { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "hook", headline: "Need it all today?", subtext: "Everything you want, in one place.", voiceover: "Need it all today? Everything you want lives in one place." },
  { id: "s2", start: 4, duration: 4, kind: "context", purpose: "context", headline: "India's ultimate one-stop destination for everything you need", subtext: "Fashion, electronics, groceries and more across one app.", voiceover: "India's ultimate one stop destination for everything you need." },
  { id: "s3", start: 8, duration: 4, kind: "feature", purpose: "feature", headline: "Millions of products", subtext: "Browse categories that cover the whole home.", voiceover: "Millions of products across every category you can think of." },
  { id: "s4", start: 12, duration: 4, kind: "stat", purpose: "proof", headline: "Trusted at scale", subtext: "Seventy five percent of shoppers return within thirty days.", stats: [{ value: "75%", label: "return in 30 days" }], voiceover: "Seventy five percent of shoppers come back within thirty days." },
  { id: "s5", start: 16, duration: 4, kind: "how", purpose: "how", headline: "Pay your way", subtext: "Wallet, cards and cash on delivery all supported.", voiceover: "Pay your way with wallet, cards or cash on delivery." },
  { id: "s6", start: 20, duration: 4, kind: "cta", purpose: "cta", headline: "Start shopping", subtext: "Free to browse.", cta: "Open the app", voiceover: "Start shopping today. It is free to browse." },
];
const TOTAL = SRC.reduce((a, s) => a + s.duration, 0);

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

function beatsOf(html) {
  const t = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!t) return [];
  let page; try { page = JSON.parse(t[1]); } catch { return []; }
  const m = /window\.OM_SCENES\s*=\s*'((?:[^'\\]|\\.)*)'/.exec(page);
  if (!m) return [];
  try {
    const raw = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    return JSON.parse(raw).map((s) => Number(s.dur) || 0).filter((d) => d > 0);
  } catch { return []; }
}

async function build(mode) {
  const dir = `${OUT}/${PACK}-${mode}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(`${JOBDIR}/assets`, `${dir}/assets`, { recursive: true });
  const assets = assetsFrom(dir);
  const manifest = JSON.parse(fs.readFileSync(`C:/internship/KEYFRAME/frames/${PACK}/pack.json`, "utf8"));
  const cues = SRC.map((s) => ({ start: s.start, end: s.start + s.duration, text: s.voiceover }));
  const built = om.buildComposition({
    storyboard: { title: "Flipkart", brand: "Flipkart", url: "flipkart.com", durationSec: TOTAL, scenes: SRC },
    dims: { width: 1080, height: 1920, fps: 30 }, framePack: PACK, assets, manifest,
    scriptCues: cues, scriptOverlay: mode === "on",
  });
  fs.writeFileSync(`${dir}/index.html`, built.indexHtml);
  return { dir, html: built.indexHtml };
}

(async () => {
  const off = await build("off");
  const on = await build("on");
  const phrases = [...on.html.matchAll(/class="kf-ph"[^>]*><span>([\s\S]*?)<\/span>/g)].map((m) => m[1]);
  console.log(`overlay OFF: kf-ph nodes = ${(off.html.match(/class="kf-ph"/g) || []).length}`);
  console.log(`overlay ON : kf-ph nodes = ${phrases.length}`);
  console.log("phrases:", JSON.stringify(phrases));

  const beats = beatsOf(off.html);
  let times = []; { let t = 0; for (const d of beats) { times.push(+(t + d / 2).toFixed(2)); t += d; } }
  if (!times.length) {
    // Fall back to the overlay's own phrase mid-points — the exact instants the
    // layer is meant to be readable — plus each scene's mid.
    const it = /var IT=(\[\[[\s\S]*?\]\]);/.exec(on.html);
    const phT = it ? JSON.parse(it[1]).map(([s, e]) => +(s + (e - s) / 2).toFixed(2)) : [];
    const scT = SRC.map((s) => +(s.start + s.duration / 2).toFixed(2));
    times = [...new Set([...scT, ...phT])].sort((a, b) => a - b);
  }
  console.log("beat mid-times:", JSON.stringify(times));

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files", "--font-render-hinting=none"],
  });
  for (const [mode, b] of [["off", off], ["on", on]]) {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.goto("file:///" + path.resolve(`${b.dir}/index.html`).replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 90000 });
    await new Promise((r) => setTimeout(r, 2000));
    const rows = [];
    for (let i = 0; i < times.length; i++) {
      await page.evaluate((tt) => { const tl = (window.__timelines || {}).vid; if (tl) tl.time(tt); }, times[i]);
      await new Promise((r) => setTimeout(r, 380));
      await page.screenshot({ path: `${b.dir}/b${String(i).padStart(2, "0")}.png` });
      const st = await page.evaluate(() => {
        const root = document.getElementById("kf-comp-root") || document.body;
        const rr = root.getBoundingClientRect();
        // visible overlay phrase + its box
        let ph = null;
        const kfs = document.getElementById("kf-script");
        if (kfs) for (const el of kfs.querySelectorAll(".kf-ph")) {
          if (el.style.display === "block") {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            ph = { text: el.textContent.trim(), top: Math.round(r.top - rr.top), bottom: Math.round(r.bottom - rr.top),
                   left: Math.round(r.left - rr.left), right: Math.round(r.right - rr.left),
                   fontPx: cs.fontSize, family: cs.fontFamily.split(",")[0], color: cs.color };
            break;
          }
        }
        // every other painted text/img box in the film
        const boxes = [];
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
            if (r.width < 40 || r.height < 18) continue;
            boxes.push({ kind: isImg ? "img" : "text", txt: txt.trim().slice(0, 48),
              top: Math.round(r.top - rr.top), bottom: Math.round(r.bottom - rr.top),
              left: Math.round(r.left - rr.left), right: Math.round(r.right - rr.left),
              fontPx: isImg ? "" : cs.fontSize });
          }
        };
        walk(document);
        return { ph, boxes, words: (root.innerText || "").trim().split(/\s+/).filter(Boolean).length, H: Math.round(rr.height), W: Math.round(rr.width) };
      });
      // overlap report
      let overlaps = [];
      if (st.ph) {
        for (const b2 of st.boxes) {
          const oy = Math.min(st.ph.bottom, b2.bottom) - Math.max(st.ph.top, b2.top);
          const ox = Math.min(st.ph.right, b2.right) - Math.max(st.ph.left, b2.left);
          if (oy > 4 && ox > 4) overlaps.push({ ...b2, oy, ox });
        }
      }
      rows.push({ t: times[i], ...st, overlaps });
      console.log(`[${mode}] t=${times[i]} words=${st.words}` +
        (st.ph ? ` | PHRASE "${st.ph.text}" @${st.ph.top}-${st.ph.bottom}px of ${st.H} font=${st.ph.fontPx} ${st.ph.family} | overlaps: ${overlaps.length} (${overlaps.filter(o=>o.kind==="text").length} text, ${overlaps.filter(o=>o.kind==="img").length} img)` : " | no overlay phrase"));
      if (st.ph) for (const o of overlaps) console.log(`        ${o.kind.padEnd(4)} ${o.top}-${o.bottom} "${o.txt}" ${o.fontPx}`);
    }
    fs.writeFileSync(`${b.dir}/report.json`, JSON.stringify(rows, null, 1));
    if (errs.length) console.log(`[${mode}] PAGE ERRORS:`, errs.slice(0, 3).join(" | "));
    await page.close();
  }
  await browser.close();
  console.log("out:", OUT);
})();
