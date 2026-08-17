#!/usr/bin/env node
// SHOT-FILM-PACK — build a FilmKit pack through its REAL skin/engine, driven by the reference's
// OWN scene deck (captured into framecheck/film-ref/<slug>/meta.json by shot-film-reference.js),
// then seek the paused timeline to the same beats and shoot them.
//
// The two sides then differ only in ENGINE, not in content — which is what turns "looks similar"
// into a frame-for-frame comparison of the design alone.
//
//   node scripts/shot-film-pack.js ember-roast                # bare (no assets: mechanics show)
//   node scripts/shot-film-pack.js ember-roast --assets 4     # with fixture captures seated
//
// Output: framecheck/film-ours/<slug>[-assets]/s<i>-<Name>.png

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const REF_ROOT = path.join(__dirname, "..", "framecheck", "film-ref");
const OUT_ROOT = path.join(__dirname, "..", "framecheck", "film-ours");

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

// The reference deck → a KEYFRAME storyboard. Copy is carried verbatim (headline keeps its
// authored "|" line breaks — forcedLines honours them); kind/purpose steer archetypeFor to the
// matching beat. Mechanics scenes map to the archetype the router expresses them from, so a
// bare run (no assets) reproduces the pack's own mechanic on that slot.
const KIND_FOR = {
  Hook: { kind: "hook" }, Statement: { kind: "quote" }, CTA: { kind: "cta" },
  Feature: { purpose: "feature", kind: "feature" }, Montage: { purpose: "showcase" },
  Stats: { kind: "stat", purpose: "proof" },
  // mechanics → their backing archetype
  Ring: { kind: "stat", purpose: "proof" },
  Scroll: { purpose: "showcase" }, Swipe: { purpose: "showcase" },
  Morph: { kind: "quote" }, Notify: { kind: "quote" }, Toggle: { kind: "quote" },
  Typing: { purpose: "feature", kind: "feature" }, Code: { purpose: "feature", kind: "feature" },
  Cursor: { purpose: "feature", kind: "feature" }, DragDrop: { purpose: "feature", kind: "feature" },
};

function storyboardFromRef(meta, maxScenes) {
  const scenes = [];
  let t = 0;
  for (const s of meta.omScenes || []) {
    if (scenes.length >= maxScenes) break;
    const base = KIND_FOR[s.name] || { kind: "quote" };
    const onScreen = [];
    if (Array.isArray(s.chips)) onScreen.push(...s.chips);
    if (Array.isArray(s.tiles)) onScreen.push(...s.tiles);
    if (Array.isArray(s.steps)) onScreen.push(...s.steps);
    if (Array.isArray(s.items)) onScreen.push(...s.items.map((it) => (typeof it === "string" ? it : [it.t, it.v].filter(Boolean).join(" — "))));
    if (Array.isArray(s.cards)) onScreen.push(...s.cards.map((c) => (typeof c === "string" ? c : [c.t, c.s].filter(Boolean).join(" — "))));
    if (Array.isArray(s.notes)) onScreen.push(...s.notes.map((n) => (Array.isArray(n) ? n.join(" — ") : String(n))));
    if (Array.isArray(s.stats)) onScreen.push(...s.stats.map((st) => `${st.to}${st.suffix || ""} ${st.label || ""}`.trim()));
    if (s.name === "Ring" && s.to != null) onScreen.push(`${s.to}${s.unit || "%"} ${s.label || ""}`.trim());
    if (s.text) onScreen.push(String(s.text));
    const dur = Number(s.dur) || 3;
    scenes.push({
      id: `s${scenes.length + 1}`, start: +t.toFixed(2), duration: dur,
      ...base,
      refName: s.name,
      kicker: s.kicker || undefined,
      headline: s.title || "",
      subtext: s.sub || "",
      onScreenText: onScreen.length ? onScreen : undefined,
      cta: s.cta || undefined,
      voiceover: "",
    });
    t += dur;
  }
  return { title: meta.slug, durationSec: +t.toFixed(2), orientation: "portrait", scenes, ctaUrl: (meta.omScenes.find((x) => x.url) || {}).url };
}

// Fixture captures, generated with sharp so <img> tags resolve to real pixels.
async function makeFixtures(dir, n) {
  const sharp = require("sharp");
  fs.mkdirSync(path.join(dir, "assets", "images"), { recursive: true });
  const specs = [
    { w: 1440, h: 900, color: "#3b5bdb", kindHint: "screenshot", source: "website" },
    { w: 1440, h: 3200, color: "#2b8a3e", kindHint: "screenshot", source: "website" },
    { w: 1920, h: 1280, color: "#e8590c", kindHint: "photo", source: "pixabay" },
    { w: 1280, h: 1600, color: "#9c36b5", kindHint: "photo", source: "pixabay" },
  ];
  const assets = [];
  for (let i = 0; i < Math.min(n, specs.length); i++) {
    const s = specs[i];
    const rel = `assets/images/fx_${i}.png`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}">
      <rect width="100%" height="100%" fill="${s.color}"/>
      <rect x="5%" y="4%" width="90%" height="10%" rx="16" fill="rgba(255,255,255,0.85)"/>
      <rect x="5%" y="18%" width="90%" height="40%" rx="16" fill="rgba(255,255,255,0.55)"/>
      <rect x="5%" y="62%" width="42%" height="30%" rx="16" fill="rgba(255,255,255,0.35)"/>
      <rect x="53%" y="62%" width="42%" height="30%" rx="16" fill="rgba(0,0,0,0.25)"/>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(dir, rel));
    assets.push({ path: rel, type: "image", source: s.source, kindHint: s.kindHint, width: s.w, height: s.h, ratio: s.w / s.h, cdScore: 80 - i * 5, cdProminence: "hero", visionOk: true, alt: `fixture ${i}` });
  }
  return assets;
}

async function main() {
  const argv = process.argv.slice(2);
  const slugs = argv.filter((a) => !a.startsWith("--"));
  const nAssets = argv.includes("--assets") ? Math.max(0, Number(argv[argv.indexOf("--assets") + 1]) || 4) : 0;
  const maxScenes = 12;
  if (!slugs.length) { console.log("usage: node scripts/shot-film-pack.js <slug…> [--assets N]"); process.exit(1); }

  const puppeteer = require("puppeteer-core");
  const exe = findChromium();
  if (!exe) { console.error("no cached Chrome — set PUPPETEER_EXECUTABLE_PATH"); process.exit(3); }
  const browser = await puppeteer.launch({
    executablePath: exe, headless: true,
    args: ["--no-sandbox", "--font-render-hinting=none", "--force-color-profile=srgb", "--hide-scrollbars"],
  });

  try {
    for (const slug of slugs) {
      const metaPath = path.join(REF_ROOT, slug, "meta.json");
      if (!fs.existsSync(metaPath)) { console.error(`[film-ours] ${slug}: no ref meta — run shot-film-reference.js first`); continue; }
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      meta.slug = slug;
      const skinMod = require(path.join(__dirname, "..", "src", "services", "film_skins", `${slug.replace(/-/g, "_")}.js`));

      const label = nAssets ? `${slug}-assets` : slug;
      const buildDir = path.join(os.tmpdir(), "film-fidelity", label);
      fs.rmSync(buildDir, { recursive: true, force: true });
      fs.mkdirSync(buildDir, { recursive: true });

      const sb = storyboardFromRef(meta, maxScenes);
      const assets = nAssets ? await makeFixtures(buildDir, nAssets) : [];
      const { indexHtml } = skinMod.buildComposition({
        storyboard: sb, dims: { width: 1080, height: 1920, fps: 30 },
        framePack: slug, captionCues: [], assets,
        localized: sb.ctaUrl ? { ctaUrl: sb.ctaUrl } : null,
        seedKey: "fidelity",
      });
      fs.writeFileSync(path.join(buildDir, "index.html"), indexHtml, "utf8");

      const outDir = path.join(OUT_ROOT, label);
      fs.rmSync(outDir, { recursive: true, force: true });
      fs.mkdirSync(outDir, { recursive: true });

      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
      await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
      try {
        await page.goto(`file://${path.join(buildDir, "index.html").replace(/\\/g, "/")}`, { waitUntil: "load", timeout: 90_000 });
        // waitForFunction's default rAF polling can stall on a backgrounded headless page;
        // a plain settle + poll loop is what the debug harness proved reliable.
        let tlReady = false;
        for (let k = 0; k < 60 && !tlReady; k++) {
          await new Promise((z) => setTimeout(z, 500));
          tlReady = await page.evaluate(() => !!(window.__timelines && window.__timelines.vid)).catch(() => false);
        }
        if (!tlReady) throw new Error("timeline never appeared");
        await page.evaluate(() => document.fonts && document.fonts.ready);
        for (const sc of sb.scenes) {
          const t = +(sc.start + sc.duration / 2).toFixed(2);
          await page.evaluate((tt) => {
            const tl = window.__timelines.vid;
            // suppressEvents=false — the proxy tween's onUpdate drives the world, drift,
            // mechanics and captions; a default seek() swallows it and shoots resting state.
            tl.pause(); tl.seek(tt, false);
            window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time: tt } }));
          }, t);
          const name = `${sc.id}-t${String(t).replace(".", "_")}-${sc.refName}.png`;
          await page.screenshot({ path: path.join(outDir, name) });
        }
        fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify({ slug, label, storyboard: sb, assets: assets.map((a) => a.path), pageErrors: errors }, null, 2), "utf8");
        console.log(`[film-ours] ${label}: ${sb.scenes.length} frame(s) -> ${path.relative(process.cwd(), outDir)}${errors.length ? ` (${errors.length} page error(s))` : ""}`);
      } catch (e) {
        console.error(`[film-ours] ${label} FAILED: ${String(e.message).slice(0, 200)}`);
        if (errors.length) console.error(`  page errors: ${errors.join(" | ")}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
