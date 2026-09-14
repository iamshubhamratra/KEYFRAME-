// COMPARE FINISHED FILMS ACROSS PACES — measured on the rendered compositions.
//
// pace-density-report prints the budgets; pace-visual-density prints what the
// deterministic chain produces. This one reads REAL finished jobs: it opens each
// composition in Chrome, samples it at a fixed cadence, and counts the text a
// viewer actually sees at each moment — then puts the paces side by side.
//
// TWO THINGS THIS GETS RIGHT, BOTH LEARNED THE HARD WAY.
//
// 1. IT PINS THE PACK. The brief stage rotates the frame pack between films
//    ("cross-family rotation"), so four jobs submitted with framePack:auto come
//    back on four different templates — and the first run of this tool reported
//    a 6x density difference that was almost entirely the templates, not the
//    pace. It now reads each job's pack and refuses to compare across different
//    ones unless --any-pack says you meant it.
//
// 2. IT SAMPLES BY THE CLOCK, NOT BY BEATS. Only the omelette bundles publish
//    their scene list in the page; scene_kit and the dedicated composers do not,
//    so a beat-aligned sampler silently degraded to "every 2 seconds" for some
//    paces and stayed beat-accurate for others — an invisible apples-to-oranges.
//    A fixed cadence is renderer-agnostic AND is the metric that matches the
//    complaint: how much is on screen at an arbitrary moment of watching.
//
//   node scripts/pace-compare.js <pace>=<jobId> [...] [--any-pack] [--step 0.5]
const fs = require("fs");
const path = require("path");
const http = require("http");
const puppeteer = require("puppeteer-core");

const JOBS = path.join(__dirname, "..", "jobs");
const argv = process.argv.slice(2);
const ANY_PACK = argv.includes("--any-pack");
const STEP = (() => { const i = argv.indexOf("--step"); return i >= 0 ? Number(argv[i + 1]) || 0.5 : 0.5; })();
const args = argv.filter((a) => a.includes("=") && !a.startsWith("--"));
if (!args.length) { console.log("usage: node scripts/pace-compare.js <pace>=<jobId> ... [--any-pack] [--step 0.5]"); process.exit(2); }

function api(jobId) {
  return new Promise((resolve) => {
    http.get(`http://localhost:8080/api/jobs/${jobId}`, (res) => {
      let b = ""; res.on("data", (d) => { b += d; });
      res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    }).on("error", () => resolve({}));
  });
}

// Every leaf text node that actually paints, deduped by its own string so a
// repeated marquee band is not counted once per copy.
const PROBE = () => {
  const seen = new Set();
  const vw = window.innerWidth, vh = window.innerHeight;
  let chars = 0, els = 0;
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (el.children.length) continue;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length < 2) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 6) continue;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.25) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      chars += t.length; els++;
    }
  };
  walk(document);
  return { chars, els };
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"],
  });
  const rows = [];
  for (const a of args) {
    const [pace, jobId] = a.split("=");
    const dir = path.join(JOBS, jobId);
    const idx = path.join(dir, "index.html");
    const job = await api(jobId);
    if (!fs.existsSync(idx)) { rows.push({ pace, jobId, err: "no index.html" }); continue; }
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")); } catch { /* none */ }
    // Voiceover: how many clips and how long the narration actually runs.
    let voClips = 0;
    try { voClips = fs.readdirSync(path.join(dir, "audio")).filter((f) => /^vo-/.test(f)).length; } catch { /* none */ }

    const page = await browser.newPage();
    const W = meta.width || 1920, H = meta.height || 1080;
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.goto("file:///" + path.resolve(idx).replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 90000 });
    await new Promise((r) => setTimeout(r, 900));
    const D = Number(meta.duration) || 30;

    const els = [], chars = [];
    for (let t = 0.5; t < D; t += STEP) {
      await page.evaluate((x) => { const tl = (window.__timelines || {}).vid; if (tl) tl.time(x); }, t);
      await new Promise((r) => setTimeout(r, 140));
      const got = await page.evaluate(PROBE);
      els.push(got.els); chars.push(got.chars);
    }
    await page.close().catch(() => {});
    const mean = (a2) => (a2.length ? a2.reduce((x, y) => x + y, 0) / a2.length : 0);
    const sorted = els.slice().sort((x, y) => x - y);
    rows.push({
      pace, jobId, pack: job.framePack || "?", dur: D, voClips,
      meanEls: +mean(els).toFixed(1), meanChars: Math.round(mean(chars)),
      p10: sorted[Math.floor(sorted.length * 0.1)] ?? 0,
      thin: Math.round((els.filter((n) => n <= 2).length / (els.length || 1)) * 100),
      samples: els.length,
    });
  }
  await browser.close();

  const ok = rows.filter((r) => !r.err);
  const packs = new Set(ok.map((r) => r.pack));
  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);

  console.log(`\nPACE COMPARISON — sampled every ${STEP}s on the finished compositions\n`);
  console.log(pad("pace", 10) + pad("job", 12) + pad("pack", 20) + num("dur", 7) + num("voClips", 9)
    + num("els/frame", 11) + num("chars/frame", 13) + num("p10 els", 9) + num("thin", 7));
  console.log("-".repeat(98));
  for (const r of rows) {
    if (r.err) { console.log(pad(r.pace, 10) + pad(r.jobId, 12) + "  " + r.err); continue; }
    console.log(pad(r.pace, 10) + pad(r.jobId, 12) + pad(r.pack, 20) + num(r.dur + "s", 7)
      + num(r.voClips, 9) + num(r.meanEls, 11) + num(r.meanChars, 13) + num(r.p10, 9) + num(r.thin + "%", 7));
  }

  if (packs.size > 1 && !ANY_PACK) {
    console.log(`\nREFUSING TO COMPARE — these jobs used ${packs.size} different packs (${[...packs].join(", ")}).`);
    console.log(`The pack changes on-screen text far more than the pace does, so a comparison across`);
    console.log(`packs measures the templates. Re-run the jobs with the same "framePack", or pass`);
    console.log(`--any-pack if you know what you are looking at.\n`);
    process.exit(2);
  }

  const base = ok.find((r) => r.pace === "normal");
  if (base) {
    console.log(`\nRELATIVE TO NORMAL — same pack, so the only variable is pace\n`);
    console.log(pad("pace", 10) + num("els/frame", 11) + num("chars/frame", 13) + num("verdict", 32));
    console.log("-".repeat(66));
    for (const r of ok) {
      const e = r.meanEls / (base.meanEls || 1), c = r.meanChars / (base.meanChars || 1);
      const verdict = r.pace === "normal" ? "baseline"
        : e < 0.9 ? "FRAME LOST INFORMATION"
        : e > 1.05 ? "denser, as intended" : "holds up";
      console.log(pad(r.pace, 10) + num(e.toFixed(2), 11) + num(c.toFixed(2), 13) + num(verdict, 32));
    }
  }
  console.log("");
})();
