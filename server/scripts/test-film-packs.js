#!/usr/bin/env node
// TEST-FILM-PACKS — build every FilmKit pack against a realistic storyboard and check it.
//
//   node scripts/test-film-packs.js               # build + structural checks, all 70
//   node scripts/test-film-packs.js --lint        # + hyperframes lint (slow)
//   node scripts/test-film-packs.js --runtime     # + headless-Chrome smoke + frame grabs
//   node scripts/test-film-packs.js ember-roast --runtime --shots
//
// The structural checks are the ones that catch the defects this codebase has actually
// shipped before: a scene that renders no content, a clip sharing a track, a hidden state
// baked as a transform, an unbounded repeat, a placeholder string reaching a film.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SKIN_DIR = path.join(__dirname, "..", "src", "services", "film_skins");
const argv = process.argv.slice(2);
const FLAGS = new Set(argv.filter((a) => a.startsWith("--")));
const ONLY = argv.filter((a) => !a.startsWith("--"));

// A storyboard shaped like the ones the production graph actually emits, with copy long
// enough to find overflow and a mix of scene purposes that exercises every archetype.
function storyboardFor(kind) {
  const long = kind === "long";
  const scenes = [
    { id: "s1", start: 0, duration: 4.2, kind: "hook", purpose: "hook", headline: long ? "The workflow your whole team has been waiting for all quarter" : "Ship faster|every single day", subtext: long ? "A single place for briefs, drafts, review and delivery — without the eleven browser tabs." : "One place for everything.", kicker: "New for 2026", onScreenText: ["Built for teams", "No setup"], voiceover: "Here is the thing every team keeps running into." },
    { id: "s2", start: 4.2, duration: 4.0, kind: "quote", purpose: "problem", headline: long ? "Most teams lose a full day every week to coordination overhead" : "Too many tools.", subtext: "And none of them talk to each other.", onScreenText: ["Context switching", "Lost handoffs"], voiceover: "Most teams lose a day a week to it." },
    { id: "s3", start: 8.2, duration: 4.4, kind: "feature", purpose: "feature", headline: "See it working", subtext: "Drafts, review and delivery in one view.", onScreenText: ["Live preview", "One-click approve", "Version history"], voiceover: "Everything lands in one view." },
    { id: "s4", start: 12.6, duration: 4.0, kind: "stat", purpose: "proof", headline: "The numbers", subtext: "Measured across 400 teams.", onScreenText: ["94% faster review cycles", "3x more drafts shipped", "40 hours saved per month"], voiceover: "The results speak for themselves." },
    { id: "s5", start: 16.6, duration: 4.2, kind: "bullet", purpose: "how", headline: "How it works", subtext: "Three steps, no migration.", onScreenText: ["Connect your stack", "Invite the team", "Ship the first draft"], voiceover: "Three steps and you are running." },
    { id: "s6", start: 20.8, duration: 4.0, kind: "bullet", purpose: "showcase", headline: "Every angle", subtext: "", onScreenText: ["Dashboard", "Mobile", "Review", "Handoff"], voiceover: "Wherever the work happens." },
    { id: "s7", start: 24.8, duration: 4.0, kind: "cta", purpose: "cta", headline: long ? "Start your first project today and see the difference" : "Start today.", subtext: "Free for 14 days.", cta: "Get started", voiceover: "Start today." },
  ];
  return { title: "KEYFRAME Demo Film", durationSec: 28.8, orientation: "portrait", scenes };
}

// Assets shaped exactly as the pipeline delivers them, including the fields the presentation
// logic reads (ratio/width/height decide the device frame; cdScore decides the ordering).
function assetsFor(n) {
  const pool = [
    { path: "assets/images/site_0.png", type: "image", source: "website", kindHint: "screenshot", width: 1440, height: 3200, ratio: 0.45, cdScore: 92, cdProminence: "hero", sceneId: "s3", alt: "product dashboard", visionOk: true },
    { path: "assets/images/site_1.png", type: "image", source: "website", kindHint: "screenshot", width: 1440, height: 900, ratio: 1.6, cdScore: 88, cdProminence: "hero", sceneId: "s6", alt: "review screen", visionOk: true },
    { path: "assets/images/0.jpg", type: "image", source: "pixabay", kindHint: "photo", width: 1920, height: 1280, ratio: 1.5, cdScore: 70, cdProminence: "support", alt: "team working", visionOk: true },
    { path: "assets/images/1.jpg", type: "image", source: "pixabay", kindHint: "people", width: 1280, height: 1600, ratio: 0.8, cdScore: 64, cdProminence: "support", alt: "person at desk", visionOk: true },
    { path: "assets/images/2.jpg", type: "image", source: "upload", kindHint: "photo", width: 2000, height: 1333, ratio: 1.5, cdScore: 80, cdProminence: "hero", alt: "product shot", visionOk: true },
    { path: "uploads/logo.png", type: "image", source: "upload", assetType: "logo", role: "logo", width: 512, height: 512, ratio: 1, cdScore: 99, alt: "logo" },
  ];
  return pool.slice(0, n);
}

const CUES = [
  { start: 0.3, end: 3.8, text: "Here is the thing every team keeps running into." },
  { start: 4.4, end: 7.9, text: "Most teams lose a day a week to it." },
  { start: 8.4, end: 12.2, text: "Everything lands in one view." },
];

// ---- structural checks ---------------------------------------------------------
function checkHtml(html, slug) {
  const errs = [], warns = [];
  // PARSE EVERY EMITTED SCRIPT. A timeline script that does not parse registers no timeline,
  // so every entrance stays at its opacity:0 hidden state and the film renders BLANK — and
  // static lint cannot see it. This caught a nested-quote bug in the entrance selectors that
  // broke all 70 packs at once.
  for (const [i, m] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
    try { new Function(m[1]); }
    catch (e) { errs.push(`script #${i} does not parse: ${e.message}`); }
  }
  const clips = [...html.matchAll(/class="clip[^"]*"[^>]*data-track-index="(\d+)"/g)].map((m) => Number(m[1]));
  const dup = clips.filter((v, i) => clips.indexOf(v) !== i);
  if (dup.length) errs.push(`duplicate track index ${[...new Set(dup)].join(",")}`);
  if (!/window\.__timelines\["vid"\]/.test(html)) errs.push("no window.__timelines[vid] registration");
  if (/repeat\s*:\s*-1/.test(html)) errs.push("unbounded repeat:-1");
  if (/DROP IMAGE TO REPLACE/i.test(html)) errs.push("source placeholder text reached the film");
  if (/\bMath\.random\b/.test(html)) errs.push("Math.random at runtime (breaks determinism)");
  if (/new Date\(|Date\.now\(/.test(html)) errs.push("Date at runtime (breaks determinism)");
  // A hidden state baked as a transform is the classic GSAP composition bug: GSAP composes
  // with the existing transform, so the element never comes back.
  if (/style="[^"]*opacity:0[^"]*transform:(?!none)/.test(html)) warns.push("an element hides with BOTH opacity:0 and a transform");
  const scenes = [...html.matchAll(/id="(s\d+)" data-start/g)].map((m) => m[1]);
  for (const s of scenes) {
    const seg = html.slice(html.indexOf(`id="${s}" data-start`));
    const end = seg.indexOf('class="clip', 40);
    const body = end > 0 ? seg.slice(0, end) : seg;
    const text = body.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const hasMedia = /<img|<svg|background:/i.test(body);
    if (!text && !hasMedia) errs.push(`scene ${s} renders nothing`);
  }
  if (!/id="cap-text"/.test(html)) warns.push("no caption node");
  if (!/container-type:size/.test(html)) warns.push("no container-type:size (cqw units will not resolve)");
  return { errs, warns };
}

async function main() {
  const files = fs.readdirSync(SKIN_DIR).filter((f) => f.endsWith(".js"));
  const targets = files.filter((f) => !ONLY.length || ONLY.some((o) => f === `${o.replace(/-/g, "_")}.js`));
  if (!targets.length) { console.error("no matching skins"); process.exit(1); }

  const dims = { width: 1080, height: 1920, fps: 30 };
  const results = [];
  for (const f of targets) {
    const slug = f.replace(/\.js$/, "").replace(/_/g, "-");
    const rec = { slug, ok: true, errs: [], warns: [], bytes: 0 };
    let mod;
    try { mod = require(path.join(SKIN_DIR, f)); }
    catch (e) { rec.ok = false; rec.errs.push(`require failed: ${e.message}`); results.push(rec); continue; }
    for (const variant of [
      { name: "rich", sb: storyboardFor("normal"), assets: assetsFor(6) },
      { name: "bare", sb: storyboardFor("long"), assets: [] },
    ]) {
      try {
        const out = mod.buildComposition({
          storyboard: variant.sb, dims, framePack: slug, captionCues: CUES,
          assets: variant.assets, brandSkin: null, localized: null, seedKey: `test-${slug}`,
        });
        rec.bytes = Math.max(rec.bytes, out.indexHtml.length);
        const c = checkHtml(out.indexHtml, slug);
        rec.errs.push(...c.errs.map((e) => `[${variant.name}] ${e}`));
        rec.warns.push(...c.warns.map((e) => `[${variant.name}] ${e}`));
        if (FLAGS.has("--write") || FLAGS.has("--runtime") || FLAGS.has("--lint")) {
          const dir = path.join(os.tmpdir(), "film-packs", slug, variant.name);
          fs.mkdirSync(path.join(dir, "assets", "images"), { recursive: true });
          fs.writeFileSync(path.join(dir, "index.html"), out.indexHtml, "utf8");
          fs.writeFileSync(path.join(dir, "meta.json"), out.metaJson, "utf8");
          rec.dir = rec.dir || {};
          rec.dir[variant.name] = dir;
        }
      } catch (e) {
        rec.ok = false;
        rec.errs.push(`[${variant.name}] build threw: ${e.message}`);
      }
    }
    // A BRANDED build must not throw either — the brand skin rotates the whole palette.
    try {
      mod.buildComposition({
        storyboard: storyboardFor("normal"), dims, framePack: slug, captionCues: CUES,
        assets: assetsFor(3), brandSkin: { accents: ["#7C3AED", "#22D3EE"], applied: true, tier: "explicit" },
        localized: { ctaUrl: "example.com" }, seedKey: `brand-${slug}`,
      });
    } catch (e) { rec.errs.push(`[branded] build threw: ${e.message}`); }
    if (rec.errs.length) rec.ok = false;
    results.push(rec);
  }

  const bad = results.filter((r) => !r.ok);
  const warned = results.filter((r) => r.ok && r.warns.length);
  console.log(`built ${results.length} pack(s): ${results.length - bad.length} ok, ${bad.length} failed, ${warned.length} with warnings`);
  for (const r of bad) console.log(`  FAIL ${r.slug}\n    ${r.errs.join("\n    ")}`);
  for (const r of warned.slice(0, 8)) console.log(`  warn ${r.slug}: ${r.warns.join("; ")}`);
  const sizes = results.map((r) => r.bytes).filter(Boolean).sort((a, b) => a - b);
  if (sizes.length) console.log(`  html size: min ${(sizes[0] / 1024).toFixed(0)}KB  median ${(sizes[Math.floor(sizes.length / 2)] / 1024).toFixed(0)}KB  max ${(sizes[sizes.length - 1] / 1024).toFixed(0)}KB`);

  if (FLAGS.has("--runtime")) {
    const { findChromium } = require("../src/services/runtime_check");
    const puppeteer = require("puppeteer-core");
    const exe = findChromium();
    if (!exe) { console.log("  (runtime skipped: no chromium)"); }
    else {
      const browser = await puppeteer.launch({ executablePath: exe, headless: "shell", args: ["--no-sandbox"] });
      let rok = 0, rbad = 0;
      for (const r of results) {
        if (!r.dir || !r.dir.rich) continue;
        const page = await browser.newPage();
        const errs = [];
        page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
        await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: FLAGS.has("--shots") ? 0.4 : 0.2 });
        await page.goto("file:///" + path.join(r.dir.rich, "index.html").replace(/\\/g, "/"), { waitUntil: "load" }).catch(() => {});
        await new Promise((z) => setTimeout(z, 350));
        const info = await page.evaluate(() => {
          const tl = window.__timelines && window.__timelines["vid"];
          if (!tl) return { tl: false };
          tl.pause();
          return { tl: true, dur: tl.duration() };
        }).catch(() => ({ tl: false }));
        if (!info.tl || errs.length) { rbad++; console.log(`  RUNTIME ${r.slug}: ${errs[0] || "no timeline"}`); }
        else rok++;
        // MEASURED SAFE-AREA CHECK. Text fitting is arithmetic (film_stage.fitLines derives the
        // size from the display face's average advance), and arithmetic can be wrong about a
        // real font. This asks the browser: at four points across the film, is any visible text
        // outside the frame? Run against the LONG-COPY deck, which is where it would happen.
        if (FLAGS.has("--overflow") && r.dir && r.dir.bare) {
          const p2 = await browser.newPage();
          await p2.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 0.25 });
          await p2.goto("file:///" + path.join(r.dir.bare, "index.html").replace(/\\/g, "/"), { waitUntil: "load" }).catch(() => {});
          await new Promise((z) => setTimeout(z, 300));
          const bad = [];
          // SAMPLED MID-SCENE, ON PURPOSE. Every camera in this family opens with a push from
          // fully offscreen — that is the cut, not a layout fault — so measuring during a
          // transition reports the design as a defect. These times sit ~55% through each scene
          // of the fixture deck, where the camera has settled and the frame is at rest.
          for (const t of [2.3, 6.4, 10.6, 14.8, 18.9, 23.0, 27.0]) {
            const out = await p2.evaluate((tt) => {
              const tl = window.__timelines && window.__timelines["vid"];
              if (!tl) return [];
              tl.pause(); tl.seek(tt);
              const W = window.innerWidth, H = window.innerHeight;
              const hits = [];
              for (const el of document.querySelectorAll("#root *")) {
                const txt = (el.textContent || "").trim();
                if (!txt || el.children.length) continue;          // leaf text nodes only
                // The animated world is DECORATION and several packs bleed giant letterforms
                // and rails off-frame deliberately. Only copy is held to the safe area.
                if (el.closest("#fk-world")) continue;
                // EFFECTIVE visibility, not the element's own. Only one scene is on screen at
                // a time: the others are alive in the DOM with their clip at opacity:0 and
                // their camera parked mid-push. Checking the leaf alone measured those dead
                // scenes and reported the transition offsets as layout overflow.
                let hidden = false;
                for (let a = el; a && a.id !== "root"; a = a.parentElement) {
                  const s = getComputedStyle(a);
                  if (s.opacity === "0" || s.visibility === "hidden" || s.display === "none") { hidden = true; break; }
                }
                if (hidden) continue;
                const cs = getComputedStyle(el);
                const b = el.getBoundingClientRect();
                if (b.width < 2 || b.height < 2) continue;
                // 2px tolerance for sub-pixel layout.
                if (b.left < -2 || b.top < -2 || b.right > W + 2 || b.bottom > H + 2) {
                  hits.push(`"${txt.slice(0, 22)}" ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}`);
                }
              }
              return hits.slice(0, 3);
            }, t).catch(() => []);
            for (const h of out) bad.push(`@${t}s ${h}`);
          }
          await p2.close();
          if (bad.length) { r.overflow = bad; console.log(`  OVERFLOW ${r.slug}: ${bad.slice(0, 2).join(" | ")}`); }
        }
        if (FLAGS.has("--shots")) {
          const shotDir = path.join(os.tmpdir(), "film-packs", "_shots");
          fs.mkdirSync(shotDir, { recursive: true });
          for (const t of [2.0, 10.0, 18.5, 26.0]) {
            await page.evaluate((tt) => { const tl = window.__timelines["vid"]; tl.pause(); tl.seek(tt); }, t).catch(() => {});
            await new Promise((z) => setTimeout(z, 120));
            await page.screenshot({ path: path.join(shotDir, `${r.slug}-t${t}.png`) }).catch(() => {});
          }
        }
        await page.close();
      }
      await browser.close();
      console.log(`  runtime: ${rok} ok, ${rbad} failed`);
    }
  }
  const over = results.filter((r) => r.overflow && r.overflow.length);
  if (FLAGS.has("--overflow")) console.log(`  overflow: ${results.length - over.length} clean, ${over.length} with text outside the frame`);
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
