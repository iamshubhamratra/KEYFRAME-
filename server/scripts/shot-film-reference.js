#!/usr/bin/env node
// SHOT-FILM-REFERENCE — shoot a FilmKit standalone (templete-design/keyframe-handoff/standalone)
// exactly as the designer sees it, one deterministic frame per scene.
//
// The sibling harness scripts/shot-reference.js does this for the 20-template
// all-template-handoffs library; the FilmKit drop is FLAT (standalone/<slug>.html, no per-template
// folder), so it needs its own resolver — the seek contract is identical: the stage svg is marked
// `data-om-sync-seek` and applies a `data-om-seek-to-time-frame` event with {time, sync:true}
// through ReactDOM.flushSync, so the same requested time always yields the same pixels.
//
//   node scripts/shot-film-reference.js ember-roast
//   node scripts/shot-film-reference.js ember-roast ghost-route --frames 6
//   node scripts/shot-film-reference.js ember-roast --at 1.5,7.4,20.1
//
// Output: framecheck/film-ref/<slug>/<slug>-t<sec>-<Scene>.png + meta.json (incl. the full
// authored OM_SCENES deck, which shot-film-pack.js reads to drive OUR engine with the same copy).

const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..");
const HANDOFF_CANDIDATES = [
  process.env.KEYFRAME_FILMKIT || "",
  path.join(REPO, "templete-design", "keyframe-handoff"),
  path.join(REPO, "old-templete", "keyframe-handoff"),
  path.join(REPO, "old-template", "keyframe-handoff"),
].filter(Boolean);
function resolveHandoff() {
  for (const dir of HANDOFF_CANDIDATES) {
    try { if (fs.statSync(path.join(dir, "standalone")).isDirectory()) return dir; } catch { /* next */ }
  }
  throw new Error(`no FilmKit handoff found. Looked in:\n  ${HANDOFF_CANDIDATES.join("\n  ")}\nSet KEYFRAME_FILMKIT.`);
}
const OUT_ROOT = path.join(__dirname, "..", "framecheck", "film-ref");

function findChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const root = path.join(home, ".cache", "puppeteer", "chrome");
  const out = [];
  try {
    for (const dir of fs.readdirSync(root)) {
      for (const sub of ["chrome-win64/chrome.exe", "chrome-linux64/chrome",
        "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"]) {
        const exe = path.join(root, dir, sub);
        if (fs.existsSync(exe)) out.push(exe);
      }
    }
  } catch { /* no cache */ }
  return out.sort().reverse()[0] || null;
}

// Re-lay the page so the stage renders 1:1 and the player chrome is hidden (the standalone
// downscales the stage to make room for its scrubber; capturing that skews every measurement).
const LAYOUT_1TO1 = () => {
  const svg = document.querySelector("[data-om-sync-seek]");
  if (!svg) return null;
  const W = Math.round(Number(svg.getAttribute("width")) || 0);
  const H = Math.round(Number(svg.getAttribute("height")) || 0);
  if (!W || !H) return null;
  document.documentElement.style.cssText = "margin:0;padding:0;width:100%;height:100%;overflow:hidden";
  document.body.style.cssText = `margin:0;padding:0;display:block;min-height:0;width:${W}px;height:${H}px;overflow:hidden;background:#000`;
  const root = document.getElementById("dc-root") || svg.closest("div") || document.body;
  root.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;display:block`;
  const stageBranch = new Set();
  for (let n = svg; n && n !== document.documentElement; n = n.parentElement) stageBranch.add(n);
  for (const el of root.querySelectorAll("*")) {
    if (stageBranch.has(el) || svg.contains(el)) continue;
    el.style.setProperty("display", "none", "important");
  }
  svg.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform:none`;
  return { width: W, height: H };
};

async function shoot(browser, handoff, slug, opts) {
  const file = path.join(handoff, "standalone", `${slug}.html`);
  if (!fs.existsSync(file)) return { slug, ok: false, error: "no standalone html" };
  const outDir = path.join(OUT_ROOT, slug);
  fs.mkdirSync(outDir, { recursive: true });

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  try {
    await page.goto(`file://${file.replace(/\\/g, "/")}`, { waitUntil: "load", timeout: opts.timeoutMs });
    await page.waitForSelector("[data-om-sync-seek]", { timeout: opts.timeoutMs });
    await page.evaluate(() => document.fonts && document.fonts.ready);

    const info = await page.evaluate(() => {
      const svg = document.querySelector("[data-om-sync-seek]");
      const attrDur = Number(svg && svg.getAttribute("data-om-exportable-video-with-duration-secs")) || 0;
      let scenes = null;
      const raw = window.OM_SCENES;
      try { scenes = typeof raw === "string" ? JSON.parse(raw) : (Array.isArray(raw) ? raw : null); } catch { scenes = null; }
      if (scenes && !Array.isArray(scenes)) scenes = null;
      const bounds = []; let sum = 0;
      for (const s of scenes || []) {
        const d = Number(s && (s.dur ?? s.duration)) || 0;
        bounds.push({ name: (s && (s.name || s.id)) || `scene${bounds.length + 1}`, start: +sum.toFixed(3), duration: d });
        sum += d;
      }
      return { duration: attrDur || +sum.toFixed(3), bounds, omScenes: scenes || null };
    });

    const geo = await page.evaluate(LAYOUT_1TO1);
    if (!geo) throw new Error("could not resolve the authored stage size");
    await page.setViewport({ width: geo.width, height: geo.height, deviceScaleFactor: 1 });

    const times = opts.at && opts.at.length
      ? opts.at
      : (info.bounds.length
        ? info.bounds.map((b) => +(b.start + b.duration / 2).toFixed(2))
        : Array.from({ length: opts.frames }, (_, i) => +(info.duration * ((i + 0.5) / opts.frames)).toFixed(2)));

    const stage = await page.$("[data-om-sync-seek]");
    const shots = [];
    for (const t of times) {
      await page.evaluate((time) => {
        const el = document.querySelector("[data-om-sync-seek]");
        el.dispatchEvent(new CustomEvent("data-om-seek-to-time-frame", { detail: { time, sync: true } }));
      }, t);
      const scene = info.bounds.find((b) => t >= b.start && t < b.start + b.duration);
      const name = `${slug}-t${String(t).replace(".", "_")}${scene ? `-${String(scene.name).replace(/[^\w-]/g, "")}` : ""}.png`;
      await stage.screenshot({ path: path.join(outDir, name) });
      shots.push({ t, scene: scene ? scene.name : null, file: name });
    }
    fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify({
      slug, duration: info.duration, stage: geo, scenes: info.bounds, shots,
      omScenes: info.omScenes, pageErrors: errors,
    }, null, 2), "utf8");
    return { slug, ok: true, duration: info.duration, shots: shots.length, outDir, errors };
  } catch (e) {
    return { slug, ok: false, error: e.message.slice(0, 200), errors };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = { frames: 8, at: null, timeoutMs: 90_000 };
  const slugs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--frames") opts.frames = Math.max(1, Number(argv[++i]) || 8);
    else if (a === "--at") opts.at = String(argv[++i] || "").split(",").map(Number).filter(Number.isFinite);
    else if (a === "--timeout") opts.timeoutMs = Math.max(5000, Number(argv[++i]) || 90_000);
    else if (!a.startsWith("--")) slugs.push(a);
  }
  const handoff = resolveHandoff();
  const all = fs.readdirSync(path.join(handoff, "standalone")).filter((f) => f.endsWith(".html") && f !== "index.html").map((f) => f.replace(/\.html$/, ""));
  const want = slugs.includes("all") ? all : slugs;
  if (!want.length) { console.log(`usage: node scripts/shot-film-reference.js <slug…|all> [--at t1,t2]\nslugs: ${all.join(", ")}`); process.exit(1); }

  const puppeteer = require("puppeteer-core");
  const exe = findChromium();
  if (!exe) { console.error("no cached Chrome found — set PUPPETEER_EXECUTABLE_PATH"); process.exit(3); }
  // Full headless (not "shell"): backdrop-filter / mix-blend-mode are part of what is compared.
  const browser = await puppeteer.launch({
    executablePath: exe, headless: true,
    args: ["--no-sandbox", "--font-render-hinting=none", "--force-color-profile=srgb", "--hide-scrollbars"],
  });
  try {
    for (const slug of want) {
      process.stdout.write(`[film-ref] ${slug} … `);
      const r = await shoot(browser, handoff, slug, opts);
      console.log(r.ok ? `${r.shots} frame(s), ${r.duration}s -> ${path.relative(process.cwd(), r.outDir)}${r.errors.length ? ` (${r.errors.length} page error(s))` : ""}` : `FAILED: ${r.error}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { resolveHandoff };
