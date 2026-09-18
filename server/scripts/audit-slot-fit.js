// SLOT-FIT AUDIT — measure every image placeholder in every render path, for real.
//
//   node scripts/audit-slot-fit.js                    # both orientations, one pack per renderer
//   node scripts/audit-slot-fit.js --dims 1920x1080   # one orientation
//   node scripts/audit-slot-fit.js --packs a,b,c      # specific packs
//   node scripts/audit-slot-fit.js --long             # include the long-form film-* skins
//   node scripts/audit-slot-fit.js --shots            # also save a PNG of every scene
//
// WHY THIS EXISTS. A placeholder's aspect ratio is nowhere in this codebase. Composers
// size media boxes by mixing units — `width:45cqw` (a % of the container's WIDTH) with
// `top:13%;bottom:13%` (a % of its HEIGHT) — so the box's SHAPE is an emergent property
// of the render dimensions that no function ever computes. That is why nothing upstream
// can pick an asset that fits: there is no number to fit to.
//
// So we measure it. Each pack is built into a real composition at real dimensions, loaded
// in the same headless Chrome the renderer uses, seeked to each scene's midpoint, and
// every <img> and background-image slot is read off the live layout:
//
//     box w x h        getBoundingClientRect on the painted element
//     source w x h     naturalWidth/naturalHeight
//     fit / position   getComputedStyle — what the browser ACTUALLY resolved
//     crop loss        the fraction of the source's width/height object-fit discards
//     upscale          scale > 1 => the asset is too small for the box it was given
//     stretch          object-fit:fill / non-uniform scale => the image is deformed
//     overflow         the painted box escaping its nearest clipping ancestor
//
// and the per-clip coverage stamps template_engine already writes
// (data-media-demand / data-media-filled) are read alongside, so an EMPTY placeholder is
// counted rather than mistaken for intentional design.
//
// Output: <out>/slot-fit.json (every row) + <out>/slot-fit.md (the audit table).
// This is the instrument the fix is measured against — run it before and after.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const frameManifest = require("../src/services/frame_manifest");
const { findChrome } = require("../src/services/ingest/website");

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : dflt; };
const has = (name) => argv.includes(name);

const OUT = path.resolve(opt("--out", path.join(__dirname, "slot-fit-out")));
const SHOTS = has("--shots");
const WANT_LONG = has("--long");
// --raw measures the composer's own output with no render-time fitting, which is how the
// "before" baseline is taken. Without it the audit grades the shipped document.
const RAW = has("--raw");
const DIMS = opt("--dims", null)
  ? [opt("--dims").split("x").map(Number)]
  : [[1920, 1080], [1080, 1920]];

// ---------------------------------------------------------------- probe storyboard
// Beats chosen to trigger every media-bearing archetype every composer publishes:
// an opener, a hero product beat, a feature, a montage/gallery, a stat, a quote, a close.
const STORYBOARD = {
  title: "Northwind Flow",
  brand: "Northwind",
  url: "northwind.com",
  durationSec: 32,
  scenes: [
    { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "hook", headline: "Ship the whole thing", emphasis: "whole", kicker: "PLATFORM", subtext: "One place to plan, build and launch.", voiceover: "One place to plan, build and launch." },
    { id: "s2", start: 4, duration: 4, kind: "feature", purpose: "feature", headline: "The product, on screen", kicker: "PRODUCT", subtext: "Real screens, not a mockup of one.", voiceover: "Real screens, not a mockup of one.", bullets: ["Live boards", "Instant docs"] },
    { id: "s3", start: 8, duration: 4, kind: "demo", purpose: "demo", headline: "Everything in one view", kicker: "WORKSPACE", subtext: "Plans, docs and delivery in a single canvas.", voiceover: "Plans, docs and delivery in a single canvas.", bullets: ["Plan it", "Build it", "Ship it"] },
    { id: "s4", start: 12, duration: 4, kind: "proof", purpose: "proof", headline: "Trusted at scale", kicker: "CUSTOMERS", badge: "4.9", badgeLabel: "average rating", subtext: "Teams of every size run on it.", voiceover: "Teams of every size run on it." },
    { id: "s5", start: 16, duration: 4, kind: "stat", purpose: "stat", headline: "faster to launch", emphasis: "8x", subtext: "8x", stats: [{ v: 8, suf: "X", l: "faster to launch" }, { v: 94, suf: "%", l: "stay past year one" }], voiceover: "Eight times faster to launch." },
    { id: "s6", start: 20, duration: 4, kind: "bullet", purpose: "how", headline: "How it works", bullets: ["Connect your repo", "Plan the sprint", "Ship on Friday"], subtext: "Three steps, no migration.", voiceover: "Three steps, no migration." },
    { id: "s7", start: 24, duration: 4, kind: "quote", purpose: "testimonial", headline: "What teams say", quote: "We cut our release cycle in half in one quarter.", author: "Dana Reyes", role: "VP Engineering, Kestrel", voiceover: "We cut our release cycle in half." },
    { id: "s8", start: 28, duration: 4, kind: "cta", purpose: "cta", headline: "Start free today", cta: "Get started", kicker: "READY", subtext: "No card needed.", voiceover: "Start free today." },
  ],
};

// ---------------------------------------------------------------- probe assets
// A gridded, edge-marked test card at each shape in the matrix. The grid makes a bad
// crop VISIBLE in --shots, and the known dimensions make it MEASURABLE in the JSON.
// Edge bars are drawn in a contrasting colour at all four edges: if an edge bar is
// missing from the render, that edge was cropped away.
const CARDS = [
  { file: "shot_desktop.png", w: 2732, h: 1800, bg: "0x1F2933", bar: "0x36E27A", kind: "screenshot", source: "website", role: "desktop website capture (matches the real 2732x1800 captures)" },
  { file: "shot_mobile.png", w: 750, h: 1624, bg: "0x21252B", bar: "0xFFB020", kind: "screenshot", source: "website", role: "mobile app capture" },
  { file: "photo_land.png", w: 1600, h: 1000, bg: "0x8A4B2A", bar: "0xFFE8C2", kind: "photo", source: "pixabay", role: "landscape photo" },
  { file: "photo_port.png", w: 1000, h: 1500, bg: "0x2A5B4B", bar: "0xC2FFE8", kind: "photo", source: "pixabay", role: "portrait photo" },
  { file: "photo_sq.png", w: 1200, h: 1200, bg: "0x4B2A5B", bar: "0xE8C2FF", kind: "photo", source: "pixabay", role: "square photo" },
  { file: "photo_wide.png", w: 2400, h: 800, bg: "0x5B4B2A", bar: "0xFFF0A0", kind: "photo", source: "pixabay", role: "ultra-wide 3:1 photo" },
  { file: "photo_small.png", w: 400, h: 260, bg: "0x333A44", bar: "0xFF6B6B", kind: "photo", source: "pixabay", role: "low-resolution photo (upscale probe)" },
  { file: "logo.png", w: 512, h: 512, bg: "0x0E1220", bar: "0x7DF9FF", kind: "logo", source: "website", role: "brand mark" },
];

function drawCard(dir, c) {
  const p = path.join(dir, "assets", "images", c.file);
  const t = Math.max(6, Math.round(Math.min(c.w, c.h) * 0.035)); // edge bar thickness
  const gx = Math.max(40, Math.round(c.w / 12));
  const gy = Math.max(40, Math.round(c.h / 12));
  const vf = [
    `drawgrid=w=${gx}:h=${gy}:t=2:c=white@0.28`,
    `drawbox=x=0:y=0:w=iw:h=${t}:color=${c.bar}@1:t=fill`,
    `drawbox=x=0:y=ih-${t}:w=iw:h=${t}:color=${c.bar}@1:t=fill`,
    `drawbox=x=0:y=0:w=${t}:h=ih:color=${c.bar}@1:t=fill`,
    `drawbox=x=iw-${t}:y=0:w=${t}:h=ih:color=${c.bar}@1:t=fill`,
    // a centre marker, so a badly-anchored crop is obvious at a glance
    `drawbox=x=(iw-${t * 4})/2:y=(ih-${t * 4})/2:w=${t * 4}:h=${t * 4}:color=white@0.85:t=fill`,
  ].join(",");
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=${c.bg}:s=${c.w}x${c.h}`, "-vf", vf, "-frames:v", "1", p],
    { windowsHide: true });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${c.file}: ${String(r.stderr || "").slice(0, 300)}`);
  return `assets/images/${c.file}`;
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" width="240" height="160">
<rect width="240" height="160" fill="#101418"/><circle cx="80" cy="80" r="46" fill="#7DF9FF"/>
<rect x="140" y="34" width="70" height="92" fill="#FF7A3C"/></svg>`;

function makeAssets(dir) {
  fs.mkdirSync(path.join(dir, "assets", "images"), { recursive: true });
  const out = [];
  for (const c of CARDS) {
    const rel = drawCard(dir, c);
    out.push({
      path: rel, type: "image", kind: c.kind, source: c.source,
      width: c.w, height: c.h, ratio: c.w / c.h,
      alt: c.kind === "screenshot" ? `REAL screenshot of the Northwind ${c.role}` : c.role,
      sees: c.role, visionOk: true,
      cdScore: c.kind === "screenshot" ? 88 : c.kind === "logo" ? 40 : 66,
      cdProminence: c.kind === "screenshot" ? "hero" : "support",
      __probe: c.file,
    });
  }
  fs.writeFileSync(path.join(dir, "assets", "images", "vector.svg"), SVG, "utf8");
  out.push({
    path: "assets/images/vector.svg", type: "image", source: "iconify", kind: "vector",
    width: 240, height: 160, ratio: 1.5, alt: "a topical vector", sees: "abstract vector mark",
    visionOk: true, cdScore: 50, cdProminence: "support", __probe: "vector.svg",
  });
  return out;
}

// ---------------------------------------------------------------- in-page measurement
// Runs inside Chrome. Returns one row per painted image-bearing element.
const MEASURE = function () {
  const rows = [];
  const clipOf = (el) => {
    let n = el.parentElement;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") return n;
      n = n.parentElement;
    }
    return null;
  };
  const sceneOf = (el) => {
    let n = el;
    while (n && n !== document.body) {
      if (n.classList && n.classList.contains("clip")) return n;
      n = n.parentElement;
    }
    return null;
  };
  const push = (el, kind, srcW, srcH, src) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const clip = clipOf(el);
    const cr = clip ? clip.getBoundingClientRect() : null;
    const sc = sceneOf(el);
    rows.push({
      kind,
      src: String(src || "").split("/").pop(),
      sceneId: sc ? sc.id : null,
      sceneType: sc ? sc.getAttribute("data-scene-type") : null,
      demand: sc ? Number(sc.getAttribute("data-media-demand")) : null,
      filled: sc ? Number(sc.getAttribute("data-media-filled")) : null,
      wants: sc ? sc.getAttribute("data-media-kinds") : null,
      boxW: Math.round(r.width * 100) / 100,
      boxH: Math.round(r.height * 100) / 100,
      // The LAYOUT box, before any ancestor transform. The long-form skins lay out in
      // their own coordinate space and scale the whole stage down, so a getBoundingClientRect
      // of 1616x3603 on a 1920x1080 canvas is not an element overflowing the frame — it is
      // the stage's own units. Aspect is invariant under a uniform scale, so crop maths is
      // unaffected either way; UPSCALE is not, and reading it off the visual rect reported
      // every long-form slot as demanding a 2x source it never asked for.
      layoutW: el.clientWidth || Math.round(r.width),
      layoutH: el.clientHeight || Math.round(r.height),
      srcW, srcH,
      fit: kind === "img" ? cs.objectFit : cs.backgroundSize,
      pos: kind === "img" ? cs.objectPosition : cs.backgroundPosition,
      opacity: Number(cs.opacity),
      transform: cs.transform === "none" ? null : cs.transform,
      clipW: cr ? Math.round(cr.width * 100) / 100 : null,
      clipH: cr ? Math.round(cr.height * 100) / 100 : null,
      overflowX: cr ? Math.round((r.width - cr.width) * 100) / 100 : 0,
      overflowY: cr ? Math.round((r.height - cr.height) * 100) / 100 : 0,
    });
  };
  for (const img of document.querySelectorAll("img")) {
    if (!img.naturalWidth) continue;
    push(img, "img", img.naturalWidth, img.naturalHeight, img.currentSrc || img.src);
  }
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const bi = cs.backgroundImage;
    if (!bi || bi === "none" || !/url\(/.test(bi)) continue;
    if (/gradient/.test(bi)) continue;
    push(el, "bg", 0, 0, (/url\(["']?([^"')]+)/.exec(bi) || [])[1] || "");
  }
  // Media slots that drew NOTHING: a clip whose declared demand exceeds what it filled.
  const empties = [];
  for (const c of document.querySelectorAll(".clip")) {
    const d = Number(c.getAttribute("data-media-demand"));
    const f = Number(c.getAttribute("data-media-filled"));
    if (Number.isFinite(d) && d > 0 && (!Number.isFinite(f) || f < d)) {
      empties.push({ sceneId: c.id, sceneType: c.getAttribute("data-scene-type"), demand: d, filled: f || 0, wants: c.getAttribute("data-media-kinds") });
    }
  }
  return { rows, empties };
};

// ---------------------------------------------------------------- fit arithmetic
// What object-fit actually does to the pixels, computed from the measured numbers.
function analyse(row) {
  const { boxW: bw, boxH: bh, srcW: sw, srcH: sh } = row;
  // Upscale is measured against the box as LAID OUT, not as painted after the stage's
  // scale transform — see the note in MEASURE.
  const lw = row.layoutW || bw, lh = row.layoutH || bh;
  const out = { ...row, cropXpct: 0, cropYpct: 0, padXpct: 0, padYpct: 0, upscale: 0, stretched: false, tooSmall: false, boxAspect: 0, srcAspect: 0, aspectMismatch: 0, flags: [] };
  if (!(bw > 2 && bh > 2)) { out.flags.push("zero-box"); return out; }
  out.boxAspect = Math.round((bw / bh) * 1000) / 1000;
  if (!(sw > 0 && sh > 0)) { out.flags.push("unknown-source"); return out; }
  out.srcAspect = Math.round((sw / sh) * 1000) / 1000;
  // How far apart the two shapes are, as a symmetric ratio: 0 = identical.
  out.aspectMismatch = Math.round(Math.abs(Math.log(out.boxAspect / out.srcAspect)) * 1000) / 1000;

  const fit = String(row.fit || "").trim();
  if (fit === "cover" || fit === "none" || fit === "scale-down" || fit === "") {
    const s = Math.max(bw / sw, bh / sh);
    const dw = sw * s, dh = sh * s;
    out.cropXpct = Math.round((1 - bw / dw) * 1000) / 10;
    out.cropYpct = Math.round((1 - bh / dh) * 1000) / 10;
    out.upscale = Math.round(Math.max(lw / sw, lh / sh) * 100) / 100;
  } else if (fit === "contain") {
    const s = Math.min(bw / sw, bh / sh);
    const dw = sw * s, dh = sh * s;
    out.padXpct = Math.round((1 - dw / bw) * 1000) / 10;
    out.padYpct = Math.round((1 - dh / bh) * 1000) / 10;
    out.upscale = Math.round(Math.min(lw / sw, lh / sh) * 100) / 100;
  } else if (fit === "fill") {
    const sx = bw / sw, sy = bh / sh;
    out.upscale = Math.round(Math.max(sx, sy) * 100) / 100;
    out.stretched = Math.abs(Math.log(sx / sy)) > 0.04;
  }
  if (out.cropXpct >= 20 || out.cropYpct >= 20) out.flags.push("heavy-crop");
  else if (out.cropXpct >= 8 || out.cropYpct >= 8) out.flags.push("crop");
  if (out.padXpct >= 30 || out.padYpct >= 30) out.flags.push("letterbox");
  if (out.stretched) out.flags.push("STRETCHED");
  if (out.upscale > 1.35) out.flags.push("upscaled");
  // The camera drift scales a clip by a percent or two between beats, so the painted box
  // routinely sits a few px outside its clipping ancestor. Only a real escape is a finding.
  if (row.overflowX > 6 || row.overflowY > 6) out.flags.push("overflows-container");
  if (Math.min(bw, bh) < 220) out.flags.push("small-slot");
  if (row.kind === "img" && String(row.src) !== "logo.png" && String(row.src) !== "vector.svg"
    && row.srcW > 0 && Math.min(bw, bh) < 160) out.flags.push("unreadable");
  // A website capture is only legible if it is shown big enough AND mostly intact.
  if (/^shot_desktop/.test(String(row.src)) && (out.cropXpct >= 15 || bw < 560)) out.flags.push("screenshot-unreadable");
  return out;
}

// ---------------------------------------------------------------- pack selection
function packsToProbe() {
  if (opt("--packs", null)) return opt("--packs").split(",").map((s) => s.trim()).filter(Boolean);
  const dir = path.join(__dirname, "..", "..", "frames");
  const byRenderer = new Map();
  for (const d of fs.readdirSync(dir)) {
    let r = null;
    try { r = (frameManifest.getManifest(d) || {}).renderer || null; } catch { r = null; }
    if (!r) continue;
    if (!byRenderer.has(r)) byRenderer.set(r, []);
    byRenderer.get(r).push(d);
  }
  const picked = [];
  for (const [r, list] of byRenderer) {
    if (/^film-/.test(r) && !WANT_LONG) continue;
    // omelette covers 197 packs across many bundled templates — sample it widely.
    picked.push(...(r === "omelette" ? list.slice(0, 6) : /^film-/.test(r) ? list.slice(0, 1) : list.slice(0, 1)));
  }
  if (WANT_LONG) {
    // keep the long-form sample to a handful of skins
    const film = picked.filter((p) => { try { return /^film-/.test((frameManifest.getManifest(p) || {}).renderer || ""); } catch { return false; } });
    const keep = new Set(film.slice(0, 4));
    return picked.filter((p) => !film.includes(p) || keep.has(p));
  }
  return picked;
}

// ---------------------------------------------------------------- build
function composerFor(pack) {
  const { PACK_RENDERERS } = require("../src/services/pipeline");
  let r = null;
  try { r = (frameManifest.getManifest(pack) || {}).renderer || null; } catch { /* none */ }
  const R = r && PACK_RENDERERS[r];
  if (R && R.composer && typeof R.composer.buildComposition === "function") return { renderer: r, composer: R.composer };
  return { renderer: r || "scene-kit", composer: require("../src/services/scene_kit") };
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error("no Chromium found"); process.exit(2); }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const packs = packsToProbe();
  console.log(`probing ${packs.length} pack(s) x ${DIMS.length} orientation(s)`);

  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--allow-file-access-from-files"],
  });

  const all = [];
  const emptyRows = [];
  const failures = [];
  try {
    for (const [W, H] of DIMS) {
      const orient = W >= H ? "16:9" : "9:16";
      const page = await browser.newPage();
      await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
      page.on("pageerror", () => { /* composition JS noise is not this audit's business */ });
      for (const pack of packs) {
        const dir = path.join(OUT, `build_${pack}_${W}x${H}`);
        fs.mkdirSync(dir, { recursive: true });
        const assets = makeAssets(dir);
        const { renderer, composer } = composerFor(pack);
        // Real focal points, from the same engine the pipeline runs — otherwise every
        // `cover` here would anchor at the centre and the audit would understate what
        // production actually does.
        if (!RAW) {
          try {
            const tm = require("../src/services/template_media");
            const aspects = tm.aspectsForFamily(composer, { width: W, height: H });
            await require("../src/services/crop_engine").annotateAssets(assets, {
              jobDir: dir,
              aspects: aspects.length ? aspects : (W >= H ? [1.6, 1.0, 0.75] : [1.5, 0.9, 2.6]),
            });
          } catch (e) { console.warn(`  ! ${pack}: crop_engine failed: ${e.message}`); }
        }
        let built;
        try {
          built = composer.buildComposition({
            storyboard: STORYBOARD, dims: { width: W, height: H, fps: 30 },
            framePack: pack, assets, seedKey: "slot-fit-audit",
          });
        } catch (e) {
          failures.push({ pack, renderer, orient, stage: "build", error: String(e && e.message || e).slice(0, 300) });
          console.warn(`  ! ${pack} @${orient} build failed: ${String(e && e.message || e).slice(0, 140)}`);
          continue;
        }
        if (!built || !built.indexHtml) {
          failures.push({ pack, renderer, orient, stage: "build", error: "no indexHtml" });
          continue;
        }
        // Measure what PRODUCTION ships, not what the composer alone emits: pipeline.js
        // injects the render-time fitter at its single HTML write site
        // (writeComposedHtml), so the audit must too or it would grade a document the
        // renderer never sees. `--raw` skips it, which is how the before/after comparison
        // is taken.
        let html = built.indexHtml;
        if (!RAW) {
          try {
            const tag = require("../src/services/asset_fit").runtimeFitScript(assets);
            if (tag) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tag}</body>`) : html + tag;
          } catch (e) { console.warn(`  ! ${pack}: fit injection failed: ${e.message}`); }
        }
        fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
        const url = "file://" + path.join(dir, "index.html").replace(/\\/g, "/");
        try {
          await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
        } catch (e) {
          failures.push({ pack, renderer, orient, stage: "load", error: String(e && e.message || e).slice(0, 200) });
          continue;
        }
        const hasTl = await page.waitForFunction(
          () => !!(window.__timelines && window.__timelines.vid), { timeout: 20_000, polling: 400 },
        ).then(() => true).catch(() => false);
        await page.evaluate((w, h) => {
          document.documentElement.style.margin = "0"; document.body.style.margin = "0";
          const root = document.querySelector("#root") || document.querySelector(".composition");
          if (root) { root.style.width = w + "px"; root.style.height = h + "px"; }
        }, W, H).catch(() => {});

        let n = 0;
        for (const sc of STORYBOARD.scenes) {
          const t = sc.start + sc.duration / 2;
          if (hasTl) {
            await page.evaluate((tt) => {
              const tl = window.__timelines.vid; tl.pause(); tl.time(tt, false);
            }, t).catch(() => {});
          } else {
            // Bundled/FilmKit paths seek by attribute rather than a GSAP timeline.
            await page.evaluate((tt) => {
              const r = document.querySelector("#root") || document.body;
              r.setAttribute("data-om-seek-to-time-frame", String(tt));
            }, t).catch(() => {});
          }
          await new Promise((res) => setTimeout(res, 320));
          let got;
          try { got = await page.evaluate(MEASURE); } catch (e) { got = null; }
          if (!got) continue;
          for (const row of got.rows) {
            if (row.opacity < 0.05) continue;              // not on screen at this beat
            if (!(row.boxW > 2 && row.boxH > 2)) continue;
            all.push({ pack, renderer, orient, W, H, atSec: t, ...analyse(row) });
            n++;
          }
          for (const e of got.empties) emptyRows.push({ pack, renderer, orient, atSec: t, ...e });
          if (SHOTS) {
            await page.screenshot({ path: path.join(OUT, `shot_${pack}_${W}x${H}_${sc.id}.png`) }).catch(() => {});
          }
        }
        console.log(`  ${pack.padEnd(24)} ${String(renderer).padEnd(20)} ${orient}  ${n} image box(es)${hasTl ? "" : "  [no gsap timeline]"}`);
      }
      await page.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // ------------------------------------------------------------ dedupe + report
  // The same slot is measured at every beat it is on screen, and the camera's drift
  // scales the box a few px between beats — so the shape, not the exact pixel, is the
  // identity. Round to the nearest 16px and keep the LARGEST measurement of each slot
  // (the drift transform only ever shrinks the painted box below its laid-out size).
  const bySlot = new Map();
  for (const r of all) {
    const k = [r.pack, r.orient, r.sceneType || r.sceneId, r.src,
      Math.round(r.boxW / 16), Math.round(r.boxH / 16)].join("|");
    const prev = bySlot.get(k);
    if (!prev || (r.boxW * r.boxH) > (prev.boxW * prev.boxH)) bySlot.set(k, r);
  }
  const rows = [...bySlot.values()];
  rows.sort((a, b) => (b.cropXpct + b.cropYpct) - (a.cropXpct + a.cropYpct));

  fs.writeFileSync(path.join(OUT, "slot-fit.json"),
    JSON.stringify({ generatedFor: DIMS.map((d) => d.join("x")), packs, rows, empties: emptyRows, failures }, null, 1), "utf8");

  const flagged = rows.filter((r) => r.flags.length);
  const md = [];
  md.push("# Slot-fit audit\n");
  md.push(`Orientations: ${DIMS.map((d) => d.join("x")).join(", ")} · packs probed: ${packs.length} · image boxes measured: ${rows.length} · flagged: ${flagged.length}\n`);
  md.push(`Failures: ${failures.length}${failures.length ? " — " + failures.map((f) => `${f.pack}@${f.orient}(${f.stage})`).join(", ") : ""}\n`);
  md.push("\n## Every measured placeholder\n");
  md.push("| pack | renderer | orient | scene type | asset | box px | box AR | src AR | fit | position | crop X% | crop Y% | upscale | flags |");
  md.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    md.push(`| ${r.pack} | ${r.renderer} | ${r.orient} | ${r.sceneType || r.sceneId || "-"} | ${r.src} | ${Math.round(r.boxW)}x${Math.round(r.boxH)} | ${r.boxAspect} | ${r.srcAspect} | ${r.fit} | ${r.pos} | ${r.cropXpct} | ${r.cropYpct} | ${r.upscale} | ${r.flags.join(" ") || "-"} |`);
  }
  if (emptyRows.length) {
    md.push("\n## Unfilled media slots (declared demand > filled)\n");
    md.push("| pack | orient | scene | type | wants | demand | filled |");
    md.push("|---|---|---|---|---|---|---|");
    const es = new Set();
    for (const e of emptyRows) {
      const k = [e.pack, e.orient, e.sceneId].join("|");
      if (es.has(k)) continue; es.add(k);
      md.push(`| ${e.pack} | ${e.orient} | ${e.sceneId} | ${e.sceneType} | ${e.wants} | ${e.demand} | ${e.filled} |`);
    }
  }
  fs.writeFileSync(path.join(OUT, "slot-fit.md"), md.join("\n"), "utf8");

  // ------------------------------------------------------------ console summary
  const pct = (n) => `${Math.round(n * 1000) / 10}%`;
  const worst = rows.filter((r) => r.cropXpct >= 15 || r.cropYpct >= 15);
  console.log(`\n${rows.length} image boxes measured · ${flagged.length} flagged (${pct(flagged.length / Math.max(1, rows.length))})`);
  console.log(`  heavy crop (>=20%)      ${rows.filter((r) => r.flags.includes("heavy-crop")).length}`);
  console.log(`  crop (8-20%)            ${rows.filter((r) => r.flags.includes("crop")).length}`);
  console.log(`  STRETCHED               ${rows.filter((r) => r.stretched).length}`);
  console.log(`  upscaled (>1.35x)       ${rows.filter((r) => r.flags.includes("upscaled")).length}`);
  console.log(`  letterboxed (>=30%)     ${rows.filter((r) => r.flags.includes("letterbox")).length}`);
  console.log(`  overflows container     ${rows.filter((r) => r.flags.includes("overflows-container")).length}`);
  console.log(`  small slot (<220px)     ${rows.filter((r) => r.flags.includes("small-slot")).length}`);
  console.log(`  screenshot unreadable   ${rows.filter((r) => r.flags.includes("screenshot-unreadable")).length}`);
  console.log(`  unfilled media slots    ${new Set(emptyRows.map((e) => [e.pack, e.orient, e.sceneId].join("|"))).size}`);
  if (worst.length) {
    console.log(`\nworst 12 by crop loss:`);
    for (const r of worst.slice(0, 12)) {
      console.log(`  ${r.pack}/${r.sceneType || r.sceneId} @${r.orient} ${r.src}  box ${Math.round(r.boxW)}x${Math.round(r.boxH)} (AR ${r.boxAspect}) vs src AR ${r.srcAspect} -> crop ${r.cropXpct}% x / ${r.cropYpct}% y`);
    }
  }
  console.log(`\nwrote ${path.join(OUT, "slot-fit.json")}`);
  console.log(`wrote ${path.join(OUT, "slot-fit.md")}`);
})().catch((e) => { console.error(e); process.exit(1); });
