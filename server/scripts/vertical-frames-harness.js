// Build a film offline with REAL captured assets and screenshot it across the
// timeline. Cheap enough to run every loop, and it catches what a duration table
// cannot: does the faster cutting actually read, and is any beat blank?
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const om = require("../src/services/omelette_adapter.js");

const PACK = process.argv[2] || "showcase-vertical";
const SRC_JOB = process.argv[3] || "yjwv6ge0mz";
const OUT = "C:/Users/kalua/AppData/Local/Temp/claude/C--internship-KEYFRAME/53b5760c-4c41-4029-a900-59b452a5a940/scratchpad/fast";
const JOBDIR = `C:/internship/KEYFRAME/server/jobs/${SRC_JOB}`;

// Real narration shaped like a real storyboard, with the real screenshots.
const SRC = [
  { id: "s1", start: 0, duration: 5, kind: "hook", headline: "Work scattered everywhere", subtext: "Email, chats and lists pull your team apart.", bullets: ["Email", "Chats", "Lists"], voiceover: "Your work is scattered across email, chats and half-finished lists." },
  { id: "s2", start: 5, duration: 5, kind: "feature", headline: "One visual place", subtext: "Capture, organize and tackle every to-do.", bullets: ["Boards", "Cards", "Timeline"], voiceover: "Trello puts every to-do in one visual place you can actually see." },
  { id: "s3", start: 10, duration: 5, kind: "feature", headline: "Automation built in", subtext: "No-code rules do the busywork for you.", bullets: ["Rules", "Buttons", "Commands"], voiceover: "No-code automation quietly handles the busywork for you." },
  { id: "s4", start: 15, duration: 5, kind: "stat", headline: "Proven at work", subtext: "Teams see value fast.", stats: [{ value: "75%", label: "value in 30 days" }], voiceover: "Teams see real value within the first thirty days." },
  { id: "s5", start: 20, duration: 5, kind: "proof", headline: "Trusted by teams", subtext: "Millions of people plan here.", bullets: ["Visa", "Coinbase", "Zoom"], voiceover: "Millions of people plan their week here every single day." },
  { id: "s6", start: 25, duration: 5, kind: "cta", headline: "Start today", subtext: "Free to try.", cta: "Get Trello free", voiceover: "Start today. Trello is free to try." },
];

function realAssets() {
  const dir = `${JOBDIR}/assets/images`;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).map((f, i) => ({
    path: `assets/images/${f}`, type: "image", source: "website",
    width: 2732, height: 1800, ratio: 1.518,
    alt: `REAL screenshot of the ${f.replace(/[_-]/g, " ").replace(/\.\w+$/, "")} page`,
    cdScore: 80, cdProminence: i < 2 ? "hero" : "support", visionOk: true,
  }));
}

// The built film writes OM_SCENES double-quoted inside the bundler payload.
function beatsOf(html) {
  const m = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return [];
  let page; try { page = JSON.parse(m[1]); } catch { return []; }
  const sm = /window\.OM_SCENES\s*=\s*('[\s\S]*?'|"[\s\S]*?")\s*;/.exec(page);
  if (!sm) return [];
  try {
    const lit = sm[1];
    const arr = JSON.parse(lit[0] === "'" ? lit.slice(1, -1) : JSON.parse(lit));
    return arr.map((s) => Number(s.dur) || 0).filter((d) => d > 0);
  } catch { return []; }
}

(async () => {
  // ASSETS=n starves the film on purpose — empty cards surface when the pool thins.
  const cap = process.env.ASSETS === undefined ? Infinity : Number(process.env.ASSETS);
  const assets = realAssets().slice(0, cap);
  const built = om.buildComposition({
    storyboard: { title: "Trello", brand: "Trello", url: "trello.com", durationSec: 30, scenes: SRC },
    dims: { width: 1080, height: 1920, fps: 30 }, framePack: PACK, assets,
  });
  const dir = `${OUT}/${PACK}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/index.html`, built.indexHtml);
  const builtBeats = beatsOf(built.indexHtml);
  // Point the film at the real captured images.
  fs.cpSync(`${JOBDIR}/assets`, `${dir}/assets`, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await page.goto("file:///" + path.resolve(`${dir}/index.html`).replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1200));

  // Sample the MIDDLE of every beat — never a transition, so a blank frame here
  // is a real blank beat and not a cross-dissolve. The beat list comes from the
  // built film itself; guessing a fixed cadence would straddle cuts.
  const times = [];
  { let t = 0; for (const d of builtBeats) { times.push(+(t + d / 2).toFixed(2)); t += d; } }

  const report = [];
  for (let i = 0; i < times.length; i++) {
    await page.evaluate((tt) => { const tl = (window.__timelines || {}).vid; if (tl) tl.time(tt); }, times[i]);
    await new Promise((r) => setTimeout(r, 350));
    const f = `${dir}/b${String(i).padStart(2, "0")}_t${times[i]}.png`;
    await page.screenshot({ path: f });
    const stat = await page.evaluate(() => {
      let imgs = 0, painted = 0;
      const walk = (root) => {
        for (const el of root.querySelectorAll("*")) {
          if (el.shadowRoot) walk(el.shadowRoot);
          if (el.tagName !== "IMG") continue;
          const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          if (r.width < 8 || r.height < 8) continue;
          imgs++;
          if (el.complete && el.naturalWidth && Number(cs.opacity) > 0.5 && cs.visibility !== "hidden") painted++;
        }
      };
      walk(document);
      const words = (document.body.innerText || "").trim().split(/\s+/).filter(Boolean).length;
      return { imgs, painted, words };
    });
    report.push({ t: times[i], ...stat });
  }
  await browser.close();

  console.log(`\n${PACK}  —  ${times.length} beats, ${assets.length} real assets`);
  console.log("beat   t      imgs  painted  words   verdict");
  let bad = 0;
  report.forEach((r, i) => {
    const v = [];
    if (r.words < 3 && !r.painted) { v.push("BLANK BEAT"); bad++; }
    else if (r.imgs && !r.painted) { v.push("EMPTY CARD"); bad++; }
    else if (r.words < 3) v.push("picture-only");
    console.log(`${String(i).padStart(3)}  ${String(r.t).padStart(6)}  ${String(r.imgs).padStart(4)}  ${String(r.painted).padStart(7)}  ${String(r.words).padStart(5)}   ${v.join(" ") || "ok"}`);
  });
  if (errs.length) console.log("PAGE ERRORS:", errs.slice(0, 3).join(" | "));
  console.log(bad ? `\nFAIL: ${bad} bad beat(s)` : `\nPASS: no blank beats, no empty cards`);
  console.log(`frames: ${dir}`);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
