// REFERENCE FRAME CAPTURE — shoot the Claude Design template as the designer sees it.
//
// The fidelity audit could previously only READ the references as code. That is how a whole
// library came to be "ported" while losing its atmosphere: an ambient layer is invisible in a
// diff and obvious in a frame. This harness closes that gap permanently.
//
// It lives in scripts/ ON PURPOSE. The first version of this tool was written into the session
// scratchpad, which is wiped between sessions — so TEMPLATE-FIDELITY-AUDIT.md §8 documents a
// validation method whose primary step no longer existed by the time anyone tried to follow it.
//
// HOW IT SEEKS. The reference runtime (animations-v2.jsx) exposes the exporter's own contract:
// an element marked `data-om-sync-seek` listens for a `data-om-seek-to-time-frame` event and,
// when `detail.sync === true`, applies the new time through ReactDOM.flushSync — a synchronous
// commit in the same JS task. So frames are DETERMINISTIC, not wall-clock samples: the same
// requested time always yields the same pixels, which is what makes a comparison meaningful.
//
// Usage:
//   node scripts/shot-reference.js Edition                       # 8 frames, auto duration
//   node scripts/shot-reference.js Edition --frames 12
//   node scripts/shot-reference.js Edition --at 0,2.5,7,18.4     # exact times, seconds
//   node scripts/shot-reference.js all --frames 6                # every template
//   node scripts/shot-reference.js Edition --out ref/Edition
//
// Output: <out>/<Template>-t<seconds>.png  (+ meta.json recording duration and scene bounds)
// Default out dir: server/framecheck/ref/<Template>/

const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..");
const HANDOFFS = path.join(REPO, "templete-design", "all-template-handoffs");
const DEFAULT_OUT = path.join(__dirname, "..", "framecheck", "ref");

function findChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const root = path.join(home, ".cache", "puppeteer", "chrome");
  const out = [];
  try {
    for (const dir of fs.readdirSync(root)) {
      for (const sub of [
        "chrome-win64/chrome.exe",
        "chrome-linux64/chrome",
        "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      ]) {
        const exe = path.join(root, dir, sub);
        if (fs.existsSync(exe)) out.push(exe);
      }
    }
  } catch { /* no cache */ }
  return out.sort().reverse()[0] || null;
}

function listTemplates() {
  return fs.readdirSync(HANDOFFS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => fs.existsSync(path.join(HANDOFFS, n, "standalone", `${n}.html`)))
    .sort();
}

// The reference stage is an <svg> authored at a fixed pixel size, which the standalone page
// then DOWNSCALES to leave room for its playback bar (measured: 1842x1036 for a 1920x1080
// stage — a 0.959 scale). Capturing that as-is would make every measurement 4% wrong and put
// the player chrome in frame, so the page is re-laid to render the stage 1:1 before shooting.
// A 3px hairline has to read as 3px or a typography comparison is fiction.
const LAYOUT_1TO1 = () => {
  const svg = document.querySelector("[data-om-sync-seek]");
  if (!svg) return null;
  const W = Math.round(Number(svg.getAttribute("width")) || 0);
  const H = Math.round(Number(svg.getAttribute("height")) || 0);
  if (!W || !H) return null;

  // The standalone page centres the stage with flex and reserves the bottom strip for the
  // player. Both have to go, or the stage cannot occupy the full viewport at authored scale.
  document.documentElement.style.cssText = "margin:0;padding:0;width:100%;height:100%;overflow:hidden";
  document.body.style.cssText = `margin:0;padding:0;display:block;min-height:0;width:${W}px;height:${H}px;overflow:hidden;background:#000`;

  const root = document.getElementById("dc-root") || svg.closest("div") || document.body;
  root.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;display:block`;

  // Hide the player chrome explicitly rather than trusting the stage to paint over it: a
  // template on a transparent ground would otherwise composite the scrubber into the frame.
  const stageBranch = new Set();
  for (let n = svg; n && n !== document.documentElement; n = n.parentElement) stageBranch.add(n);
  for (const el of root.querySelectorAll("*")) {
    if (stageBranch.has(el) || svg.contains(el)) continue;
    el.style.setProperty("display", "none", "important");
  }

  svg.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform:none`;
  return { width: W, height: H };
};

function parseArgs(argv) {
  const opts = { frames: 8, at: null, out: null, force: false, timeoutMs: 60_000 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--frames") opts.frames = Math.max(1, Number(argv[++i]) || 8);
    else if (a === "--at") opts.at = String(argv[++i] || "").split(",").map(Number).filter((n) => Number.isFinite(n));
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--force") opts.force = true;
    else if (a === "--timeout") opts.timeoutMs = Math.max(5000, Number(argv[++i]) || 60_000);
    else if (a.startsWith("--")) { console.error(`unknown flag ${a}`); process.exit(2); }
    else positional.push(a);
  }
  return { opts, positional };
}

async function shootTemplate(browser, tpl, opts) {
  const file = path.join(HANDOFFS, tpl, "standalone", `${tpl}.html`);
  if (!fs.existsSync(file)) return { tpl, ok: false, error: "no standalone html" };

  const outDir = opts.out ? path.resolve(opts.out) : path.join(DEFAULT_OUT, tpl);
  fs.mkdirSync(outDir, { recursive: true });

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  // Boot at a generous viewport so nothing is clipped before the 1:1 re-layout below measures
  // the authored size; the viewport is then set to exactly that size.
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  try {
    await page.goto(`file://${file.replace(/\\/g, "/")}`, { waitUntil: "load", timeout: opts.timeoutMs });

    // The bundle boots React, then the stage mounts and marks itself seekable. Waiting on the
    // ATTRIBUTE (not a timer) is what makes this reliable across templates of different weight.
    await page.waitForSelector("[data-om-sync-seek]", { timeout: opts.timeoutMs });
    // Fonts must be laid out before the first shot or the frame captures fallback metrics —
    // which would make every typography comparison a lie.
    await page.evaluate(() => document.fonts && document.fonts.ready);

    // Duration and the scene table come from the stage's OWN export attributes, not from prose.
    // The README's "~19s" for Edition is the design intent; the film the runtime actually plays
    // is 30.5s, and sampling against the wrong number shoots the wrong beats.
    const info = await page.evaluate(() => {
      const svg = document.querySelector("[data-om-sync-seek]");
      const attrDur = Number(svg && svg.getAttribute("data-om-exportable-video-with-duration-secs")) || 0;

      // OM_SCENES is a JSON *string* on the standalone page (an array only when authored
      // in-page), and its per-scene key is `dur`. Reading it as an array yielded zero scenes.
      let scenes = null;
      const raw = window.OM_SCENES;
      try { scenes = typeof raw === "string" ? JSON.parse(raw) : (Array.isArray(raw) ? raw : null); }
      catch { scenes = null; }
      if (scenes && !Array.isArray(scenes)) scenes = null;

      const bounds = [];
      let sum = 0;
      for (const s of scenes || []) {
        const d = Number(s && (s.dur ?? s.duration ?? s.length ?? s.seconds)) || 0;
        bounds.push({ name: (s && (s.name || s.id || s.component)) || `scene${bounds.length + 1}`, start: +sum.toFixed(3), duration: d });
        sum += d;
      }
      return {
        duration: attrDur || +sum.toFixed(3),
        sceneSum: +sum.toFixed(3),
        bounds,
        sceneCount: (scenes || []).length,
        playback: window.OM_PLAYBACK ? String(window.OM_PLAYBACK).slice(0, 120) : null,
        // The FULL authored scene table — names, durations AND copy. scripts/shot-pack.js reads
        // this to drive OUR composer with the reference's own content and timing, which is what
        // turns "looks similar" into a frame-for-frame comparison of the DESIGN alone.
        omScenes: scenes || null,
      };
    });

    const geo = await page.evaluate(LAYOUT_1TO1);
    if (!geo) throw new Error("could not resolve the authored stage size");
    await page.setViewport({ width: geo.width, height: geo.height, deviceScaleFactor: 1 });

    const duration = info.duration || 18;

    // Prefer the MIDDLE of each scene when the scene table is known: an evenly-spaced sample can
    // land on a cut and shoot a frame that is half of two designs.
    const times = opts.at && opts.at.length
      ? opts.at
      : (info.bounds.length && info.bounds.length >= opts.frames
        ? info.bounds.slice(0, opts.frames).map((b) => +(b.start + b.duration / 2).toFixed(2))
        : (info.bounds.length
          ? info.bounds.map((b) => +(b.start + b.duration / 2).toFixed(2))
          : Array.from({ length: opts.frames }, (_, i) => +(duration * ((i + 0.5) / opts.frames)).toFixed(2))));

    const stage = await page.$("[data-om-sync-seek]");
    const shots = [];
    for (const t of times) {
      const applied = await page.evaluate((time) => {
        const el = document.querySelector("[data-om-sync-seek]");
        if (!el) return null;
        el.dispatchEvent(new CustomEvent("data-om-seek-to-time-frame", { detail: { time, sync: true } }));
        return true;
      }, t);
      if (!applied) throw new Error("seek target vanished");
      const scene = info.bounds.find((b) => t >= b.start && t < b.start + b.duration);
      const name = `${tpl}-t${String(t).replace(".", "_")}${scene ? `-${String(scene.name).replace(/[^\w-]/g, "")}` : ""}.png`;
      // Screenshot the STAGE ELEMENT, so the frame is exactly the authored box — no
      // letterboxing, no player chrome, no scale.
      await stage.screenshot({ path: path.join(outDir, name) });
      shots.push({ t, scene: scene ? scene.name : null, file: name });
    }

    fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify({
      template: tpl, duration, sceneSum: info.sceneSum, playback: info.playback,
      stage: geo, sceneCount: info.sceneCount, scenes: info.bounds, shots, pageErrors: errors,
      omScenes: info.omScenes,
    }, null, 2), "utf8");

    return { tpl, ok: true, duration, shots: shots.length, outDir, sceneCount: info.sceneCount, stage: geo, errors };
  } catch (e) {
    return { tpl, ok: false, error: e.message.slice(0, 200), errors };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  const all = listTemplates();
  if (!positional.length) {
    console.log(`usage: node scripts/shot-reference.js <Template|all> [--frames N] [--at 0,2.5,7] [--out dir]`);
    console.log(`templates: ${all.join(", ")}`);
    process.exit(1);
  }
  const want = positional.includes("all") ? all : positional;
  const unknown = want.filter((t) => !all.includes(t));
  if (unknown.length) { console.error(`unknown template(s): ${unknown.join(", ")}`); process.exit(2); }

  let puppeteer;
  try { puppeteer = require("puppeteer-core"); }
  catch { console.error("puppeteer-core not installed"); process.exit(3); }
  const exe = findChromium();
  if (!exe) { console.error("no cached Chrome found — set PUPPETEER_EXECUTABLE_PATH"); process.exit(3); }

  // headless:"shell" is what the rest of the pipeline uses, but it does NOT composite
  // backdrop-filter or mix-blend-mode the same way the new headless does — and those are two of
  // the effects this audit exists to compare. Use the full headless browser.
  const browser = await puppeteer.launch({
    executablePath: exe, headless: true,
    args: ["--no-sandbox", "--font-render-hinting=none", "--force-color-profile=srgb", "--hide-scrollbars"],
  });

  const results = [];
  try {
    for (const tpl of want) {
      process.stdout.write(`[ref] ${tpl} … `);
      const r = await shootTemplate(browser, tpl, opts);
      results.push(r);
      console.log(r.ok
        ? `${r.shots} frame(s), ${r.duration}s, ${r.sceneCount || "?"} scene(s) -> ${path.relative(process.cwd(), r.outDir)}${r.errors.length ? ` (${r.errors.length} page error(s))` : ""}`
        : `FAILED: ${r.error}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`\n[ref] ${results.length - bad.length}/${results.length} captured`);
  if (bad.length) { console.error(`[ref] failed: ${bad.map((b) => `${b.tpl} (${b.error})`).join(", ")}`); process.exit(1); }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { listTemplates, shootTemplate, findChromium };
