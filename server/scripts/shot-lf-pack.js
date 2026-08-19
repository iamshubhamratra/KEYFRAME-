#!/usr/bin/env node
// SHOT-LF-PACK — shoot OUR long-form composition at the same timestamps the reference was shot
// at, so the two can be diffed frame for frame.
//
// The sibling is scripts/shot-lf-reference.js — except there isn't one, and deliberately so:
// scripts/shot-film-reference.js already resolves any handoff directory containing standalone/,
// and the long-form drop ships 28 of them honouring the same data-om-sync-seek contract
// (engine/animations-v2.jsx:673-721). So the reference half is:
//
//   KEYFRAME_FILMKIT=<repo>/templete-design/longform-handoff \
//     node scripts/shot-film-reference.js fetch-club
//
// which writes framecheck/film-ref/<slug>/ plus a meta.json carrying the authored 40-scene deck.
// THIS script reads that meta.json, drives our engine with THE SAME DECK, seeks to THE SAME
// TIMES, and writes framecheck/lf-pack/<slug>/. Same content, same clock, two engines — which is
// the only comparison that can honestly be called fidelity.
//
//   node scripts/shot-lf-pack.js fetch-club
//   node scripts/shot-lf-pack.js fetch-club --at 3.75,18.75
//   node scripts/shot-lf-pack.js fetch-club --html-only     # build, don't launch Chromium
//
// Exits non-zero on a page error, because a composition that throws in the console has not been
// shot successfully however plausible the PNG looks.

const fs = require("node:fs");
const path = require("node:path");

const REF_ROOT = path.join(__dirname, "..", "framecheck", "film-ref");
const OUT_ROOT = path.join(__dirname, "..", "framecheck", "lf-pack");
const SKIN_DIR = path.join(__dirname, "..", "src", "services", "lf_skins");

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

// Build our composition from the reference's own deck. The mapping is deliberately thin: the
// authored scene objects go through verbatim, because lf_stage's content adapter passes native
// renderer keys straight to the renderer. Anything richer here would be this harness quietly
// improving the input, which is the one thing a fidelity harness must never do.
function buildFromRef(slug, meta) {
  const modPath = path.join(SKIN_DIR, `${slug.replace(/-/g, "_")}.js`);
  if (!fs.existsSync(modPath)) throw new Error(`no skin for ${slug} — run scripts/gen-lf-skins.js`);
  const skin = require(modPath);
  const storyboard = {
    title: meta.slug,
    durationSec: meta.duration,
    scenes: (meta.omScenes || []).map((s, i) => ({
      ...s,
      id: `s${i}`,
      start: meta.scenes[i] ? meta.scenes[i].start : undefined,
      duration: Number(s.dur) || undefined,
    })),
  };
  return skin.buildComposition({
    storyboard,
    dims: { width: 1920, height: 1080, fps: 30 },
    captionCues: [],
    assets: [],
  });
}

async function shoot(slug, opts) {
  const refDir = path.join(REF_ROOT, slug);
  const metaPath = path.join(refDir, "meta.json");
  if (!fs.existsSync(metaPath)) {
    throw new Error(`no reference for ${slug}. Shoot it first:\n  KEYFRAME_FILMKIT=<repo>/templete-design/longform-handoff node scripts/shot-film-reference.js ${slug}`);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const outDir = path.join(OUT_ROOT, slug);
  fs.mkdirSync(outDir, { recursive: true });

  const { indexHtml } = buildFromRef(slug, meta);
  const htmlPath = path.join(outDir, "index.html");
  fs.writeFileSync(htmlPath, indexHtml, "utf8");

  // The times the reference actually used, so the diff is like-for-like. meta.shots carries them
  // with the scene each landed in, which is what makes a per-beat report possible.
  const times = opts.at && opts.at.length ? opts.at : (meta.shots || []).map((s) => s.t);
  if (opts.htmlOnly) return { slug, ok: true, html: htmlPath, shots: 0, times: times.length };

  const puppeteer = require("puppeteer-core");
  const exe = findChromium();
  if (!exe) throw new Error("no Chromium found; set PUPPETEER_EXECUTABLE_PATH");
  const browser = await puppeteer.launch({
    executablePath: exe, headless: "new",
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 220)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 180)}`); });
  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto("file://" + htmlPath.split(path.sep).join("/"), { waitUntil: "load", timeout: 60000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);

    const diag = await page.evaluate(() => ({
      timeline: !!(window.__timelines && window.__timelines.vid),
      beats: typeof LFBEATS === "undefined" ? 0 : Object.keys(LFBEATS).length,
      scenes: typeof LFSCENES === "undefined" ? 0 : LFSCENES.length,
      draw: typeof LFdraw === "function",
      world: typeof World === "function",
    }));

    const stage = await page.$("#root");
    const shots = [];
    for (const t of times) {
      await page.evaluate((tt) => {
        const tl = window.__timelines.vid;
        tl.pause();
        // seek(t, false) — suppressCallbacks false, so the proxy's onUpdate runs. A default
        // seek() swallows it and shoots the resting state; film_stage learned this the same way.
        tl.seek(tt, false);
        window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time: tt } }));
      }, t);
      const scene = (meta.scenes || []).find((b) => t >= b.start && t < b.start + b.duration);
      const name = `${slug}-t${String(t).replace(".", "_")}${scene ? `-${String(scene.name).replace(/[^\w-]/g, "")}` : ""}.png`;
      await stage.screenshot({ path: path.join(outDir, name) });
      shots.push({ t, scene: scene ? scene.name : null, file: name });
    }
    fs.writeFileSync(path.join(outDir, "meta.json"),
      JSON.stringify({ slug, diag, shots, pageErrors: errors }, null, 2), "utf8");
    return { slug, ok: errors.length === 0, diag, shots: shots.length, errors, outDir };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const htmlOnly = argv.includes("--html-only");
  const atIdx = argv.indexOf("--at");
  const at = atIdx >= 0 ? String(argv[atIdx + 1] || "").split(",").map(Number).filter((n) => Number.isFinite(n)) : [];
  const slugs = argv.filter((a, i) => !a.startsWith("--") && !(atIdx >= 0 && i === atIdx + 1));
  const list = slugs.length ? slugs : fs.readdirSync(REF_ROOT).filter((d) => fs.existsSync(path.join(REF_ROOT, d, "meta.json")));
  if (!list.length) { console.error("nothing to shoot — no references in framecheck/film-ref"); process.exit(1); }

  let bad = 0;
  for (const slug of list) {
    try {
      const res = await shoot(slug, { at, htmlOnly });
      if (res.htmlOnly || htmlOnly) { console.log(`[lf-pack] ${slug} … html only -> ${path.relative(process.cwd(), res.html)}`); continue; }
      const d = res.diag || {};
      console.log(`[lf-pack] ${slug} … ${res.shots} frame(s) · beats=${d.beats} scenes=${d.scenes} timeline=${d.timeline} world=${d.world}`
        + (res.errors && res.errors.length ? ` · ${res.errors.length} PAGE ERROR(S)` : ""));
      if (res.errors && res.errors.length) { res.errors.slice(0, 5).forEach((e) => console.error(`   ! ${e}`)); bad++; }
    } catch (e) {
      console.error(`[lf-pack] ${slug} FAILED: ${e.message}`);
      bad++;
    }
  }
  process.exit(bad ? 1 : 0);
}

main();
