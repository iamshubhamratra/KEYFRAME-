#!/usr/bin/env node
// SHOOT THE FOUR PACES — real compositions, real Chrome, real pixels.
//
//   node scripts/shoot-pace-density.js
//   node scripts/shoot-pace-density.js --pack bold-poster --dims 1080x1920
//   node scripts/shoot-pace-density.js --job <id> --duration 60
//   node scripts/shoot-pace-density.js --baseline        # the pre-fix behaviour
//
// WHY PIXELS AND NOT FIELDS. scripts/audit-pace-density.js counts what the
// producers PUT on a scene; this counts what the renderer actually PAINTS. The
// two can disagree, and the ways they disagree are the ones that matter: a
// composer that only lays out two of the four labels it was given, a support
// line clipped to nothing by its slot, a chip row that overlaps the caption
// band. Only the DOM knows.
//
// It builds the same storyboard the pipeline would, once per pace, through the
// real `composer.buildComposition()` for the chosen pack, loads it in the same
// headless Chrome the renderer uses, seeks to each scene's midpoint and reads
// every painted text box off the live layout. No LLM, no TTS, no MP4 encode —
// so it costs nothing and can run on every change.
//
// WHAT IT REPORTS, per pace:
//   text elements / frame     what the viewer actually sees painted
//   text chars / frame        how much of it there is
//   text ink %                share of the frame covered by type
//   empty frames              frames painting one text box or none
//   overlaps                  text boxes intersecting each other
//
// `--baseline` re-runs with the density system OFF and the old pace-throttled
// line cap ON, so the before/after is measured on the same pack, the same brief
// and the same Chrome rather than argued about.

const fs = require("node:fs");
const path = require("node:path");
const P = require("../src/services/pacing");
const CD = require("../src/services/content_density");
const frameManifest = require("../src/services/frame_manifest");
const { findChrome } = require("../src/services/ingest/website");

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : d;
};
const BASELINE = argv.includes("--baseline");
const MODES = ["relaxed", "normal", "fast", "very-fast"];
const OUT = path.join(__dirname, "pace-shots" + (BASELINE ? "-baseline" : ""));
const [W, H] = String(flag("dims", "1920x1080")).split("x").map(Number);
const PACK = flag("pack", "bold-poster");
const DURATION = Number(flag("duration", 60));

const norm = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------------

function pickJob(id) {
  const p = path.join(__dirname, "..", "jobs.json");
  if (!fs.existsSync(p)) return null;
  let jobs = [];
  try { jobs = Object.values(JSON.parse(fs.readFileSync(p, "utf8"))); } catch { return null; }
  jobs = jobs.filter((j) => j && j.brief && j.script && (j.script.scenes || []).length);
  if (!jobs.length) return null;
  if (id) return jobs.find((j) => j.id === id) || null;
  return jobs.sort((a, b) => {
    const size = (j) => ((j.brief.keyMessages || []).length + (j.brief.mustIncludeFacts || []).length);
    return size(b) - size(a);
  })[0];
}

/**
 * The storyboard as production would hand it to the composer at this pace.
 *
 * Scenes arrive HEADLINE-ONLY, which is the measured reality (job agmoif2udy
 * came back with `subtext: ""` on every scene and no bullets at all) and the
 * hardest case for the density system. `--baseline` then stops there and also
 * re-imposes the old pace-throttled label cap, so the comparison is against the
 * behaviour that actually shipped rather than against an idealised one.
 */
function buildStoryboard(job, mode) {
  const pacing = P.resolve(mode, { durationSec: DURATION, orientation: W >= H ? "horizontal" : "vertical" });
  const src = job.script.scenes;
  const n = Math.max(2, Math.min(pacing.scene.count, 60));
  const sec = r2(DURATION / n);
  let t = 0;
  const scenes = Array.from({ length: n }, (_, i) => {
    const from = src[Math.floor((i * src.length) / n)];
    const s = {
      id: `s${i + 1}`, start: r2(t), duration: sec,
      kind: from.purpose || "point", purpose: from.purpose || "point",
      headline: norm((from.onScreenText || [])[0]) || norm(from.visualDirection).slice(0, 48),
      subtext: "", bullets: [], kicker: "", emphasis: "",
      voiceover: norm(from.voiceover),
      visualMotif: norm(from.visualDirection),
      animation: "", layout: "", beats: [],
    };
    t = r2(t + sec);
    return s;
  });
  // ORIENTATION IS NOT OPTIONAL. Composers size their stage from the storyboard,
  // not from the viewport: without these the omelette bundle laid its 1920px
  // frame out at 1080px and every shot came back with the right 44% black, which
  // silently halves the ink figure and hides half the overlaps.
  const storyboard = {
    title: job.script.title || "Pace probe",
    brand: job.brief.subject || "KEYFRAME",
    durationSec: DURATION,
    orientation: W >= H ? "horizontal" : "vertical",
    aspectRatio: W >= H ? "16:9" : "9:16",
    scenes,
  };

  if (!BASELINE) {
    const script = { scenes: scenes.map((s) => ({ id: s.id, duration: s.duration, voiceover: s.voiceover, onScreenText: [s.headline].filter(Boolean) })) };
    CD.directDensity({ jobId: `shoot:${mode}`, brief: job.brief, script, storyboard, pacing });
  }
  return { storyboard, pacing };
}

// ---------------------------------------------------------------------------
// MEASUREMENT — read every painted text box off the live layout.
// ---------------------------------------------------------------------------

// EVERY SCENE OF THE FILM LIVES IN ONE DOCUMENT. A composition is not a page per
// scene — all of them are in the DOM at once and the timeline hides the ones that
// are not on screen. A naive walk therefore reports the WHOLE FILM as if it were
// a single frame: the first cut of this probe measured 94 text boxes and 583%
// text ink on a 1920x1080 frame, which is how you know you are counting scenes
// that are not being painted.
//
// So visibility is resolved properly:
//   - checkVisibility() covers display:none, visibility:hidden, content-visibility
//     and any ANCESTOR with opacity 0 (element-level getComputedStyle does NOT —
//     opacity is not inherited, so a hidden scene's children each report 1).
//   - effective opacity is the PRODUCT up the ancestor chain.
//   - the element must intersect the viewport.
//   - and its own centre must actually hit it (or one of its descendants), which
//     drops boxes buried under an opaque scene stacked on top.
const MEASURE = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const seen = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let el;
  while ((el = walk.nextNode())) {
    // Only elements whose OWN text nodes carry copy — a wrapper would double-count
    // everything inside it.
    let own = "";
    for (const nd of el.childNodes) if (nd.nodeType === 3) own += nd.nodeValue;
    own = own.replace(/\\s+/g, " ").trim();
    if (!own) continue;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;

    let op = 1;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === "none" || cs.visibility === "hidden") { op = 0; break; }
      op *= (parseFloat(cs.opacity) || 0);
      if (op <= 0.05) break;
    }
    if (!(op > 0.05)) continue;

    const r = el.getBoundingClientRect();
    if (!(r.width > 2 && r.height > 2)) continue;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;

    // A MARQUEE IS NOT DISPLAY COPY. Several packs run a repeating ticker strip
    // ("GO BOARD GAME AND *** ..." x12) as ONE text node of ~870 characters. It is
    // brand furniture, identical on every frame at every pace, and counting it
    // buried the signal completely: the first corrected run reported exactly 868
    // chars/frame for all four modes because that ticker was nearly all of it.
    // Display copy is never this long - the widest slot in the system is a 120
    // char subtext.
    if (own.length > 180) continue;

    // Is this box actually painted, or buried under an opaque scene stacked over
    // it? Sampled at five points rather than one: a headline with a big cap-height
    // often has its geometric centre in the gap between two glyph rows, where
    // elementFromPoint returns the parent and a single-point test would drop a
    // line that is plainly on screen.
    let painted = false;
    for (const [fx, fy] of [[0.5, 0.5], [0.15, 0.3], [0.85, 0.3], [0.15, 0.7], [0.85, 0.7]]) {
      const px = Math.min(vw - 1, Math.max(0, r.left + r.width * fx));
      const py = Math.min(vh - 1, Math.max(0, r.top + r.height * fy));
      const hit = document.elementFromPoint(px, py);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) { painted = true; break; }
    }
    if (!painted) continue;

    seen.push({
      text: own.slice(0, 160), chars: own.length,
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
      fontPx: Math.round(parseFloat(getComputedStyle(el).fontSize) || 0),
    });
  }
  return { vw, vh, seen };
})()`;

// Two painted text boxes sitting on top of each other. The user-visible symptom
// is a caption over a label or a chip row over the headline, so any real
// intersection is worth reporting — a few pixels of touching is not.
function overlaps(boxes) {
  let n = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 6 && oy > 6) {
        const area = ox * oy;
        if (area > 0.25 * Math.min(a.w * a.h, b.w * b.h)) n++;
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------------

function composerFor(pack) {
  const { PACK_RENDERERS } = require("../src/services/pipeline");
  let r = null;
  try { r = frameManifest.getManifest(pack)?.renderer || null; } catch { /* default below */ }
  const R = r && PACK_RENDERERS[r];
  if (R && R.composer && typeof R.composer.buildComposition === "function") return { renderer: r, composer: R.composer };
  return { renderer: r || "scene-kit", composer: require("../src/services/scene_kit") };
}

(async () => {
  const job = pickJob(flag("job"));
  if (!job) { console.error("no job with a brief + script in jobs.json"); process.exit(2); }
  const chrome = findChrome();
  if (!chrome) { console.error("no Chromium found"); process.exit(2); }

  // Windows holds a transient handle on a freshly-written PNG (the shell that just
  // read one, an indexer); a locked leftover must not abort the whole run.
  try { fs.rmSync(OUT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch (e) { console.warn(`  (could not clear ${OUT}: ${e.code} — reusing)`); }
  fs.mkdirSync(OUT, { recursive: true });

  const { renderer, composer } = composerFor(PACK);
  console.log(`\nSHOOTING "${PACK}" (${renderer}) at ${W}x${H}, ${DURATION}s`);
  console.log(`job ${job.id} — ${(job.brief.keyMessages || []).length} key message(s), ${(job.brief.mustIncludeFacts || []).length} fact(s)`);
  console.log(BASELINE ? "MODE: BASELINE (density system OFF)\n" : "MODE: with the content-density system\n");

  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--allow-file-access-from-files"],
  });

  const rows = [];
  try {
    for (const mode of MODES) {
      const { storyboard, pacing } = buildStoryboard(job, mode);
      const dir = path.join(OUT, mode);
      fs.mkdirSync(dir, { recursive: true });

      let built;
      try {
        built = composer.buildComposition({
          storyboard, dims: { width: W, height: H, fps: 30 },
          framePack: PACK, assets: [], seedKey: `pace-${mode}`,
        });
      } catch (e) {
        console.warn(`  ! ${mode}: build failed — ${String(e && e.message || e).slice(0, 160)}`);
        continue;
      }
      if (!built || !built.indexHtml) { console.warn(`  ! ${mode}: no indexHtml`); continue; }
      fs.writeFileSync(path.join(dir, "index.html"), built.indexHtml, "utf8");

      const page = await browser.newPage();
      await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
      page.on("pageerror", () => { /* composition JS noise is not this probe's business */ });
      const url = "file://" + path.join(dir, "index.html").replace(/\\/g, "/");
      try { await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 }); }
      catch (e) { console.warn(`  ! ${mode}: load failed`); await page.close().catch(() => {}); continue; }

      const hasTl = await page.waitForFunction(
        () => !!(window.__timelines && window.__timelines.vid), { timeout: 20_000, polling: 400 },
      ).then(() => true).catch(() => false);

      // SIZE THE COMPOSITION TO THE VIEWPORT. A composition root sizes itself
      // from the dims it was built with, and without this the frame painted at
      // its own width inside a wider window — the first shots came back with the
      // right 44% of every 1920px frame black, which would have made every ink
      // and overlap number wrong. scripts/audit-slot-fit.js does the same thing
      // for the same reason.
      await page.evaluate((w, h) => {
        document.documentElement.style.margin = "0";
        document.body.style.margin = "0";
        const root = document.querySelector("#root") || document.querySelector(".composition");
        if (root) { root.style.width = w + "px"; root.style.height = h + "px"; }
      }, W, H).catch(() => {});

      if (!hasTl) console.log(`    (${mode}: no GSAP timeline - seeking by attribute)`);
      let frames = 0, elements = 0, chars = 0, ink = 0, thin = 0, over = 0;
      // Sample up to 12 frames spread across the film — enough to characterise it
      // without shooting 39 PNGs per mode.
      const pick = storyboard.scenes.filter((_, i) =>
        storyboard.scenes.length <= 12 || i % Math.ceil(storyboard.scenes.length / 12) === 0);

      for (const sc of pick) {
        const t = sc.start + sc.duration / 2;
        if (hasTl) {
          await page.evaluate((tt) => { const tl = window.__timelines.vid; tl.pause(); tl.time(tt, false); }, t).catch(() => {});
        } else {
          await page.evaluate((tt) => {
            const r = document.querySelector("#root") || document.body;
            r.setAttribute("data-om-seek-to-time-frame", String(tt));
          }, t).catch(() => {});
        }
        await new Promise((res) => setTimeout(res, 300));
        let got = null;
        try { got = await page.evaluate(MEASURE); } catch { got = null; }
        if (!got) continue;
        frames++;
        elements += got.seen.length;
        chars += got.seen.reduce((a, b) => a + b.chars, 0);
        ink += got.seen.reduce((a, b) => a + b.w * b.h, 0) / (got.vw * got.vh);
        if (got.seen.length <= 1) thin++;
        over += overlaps(got.seen);
        await page.screenshot({ path: path.join(dir, `${sc.id}.png`) }).catch(() => {});
      }
      await page.close().catch(() => {});

      const stats = CD.frameStats(storyboard);
      rows.push({
        mode, label: pacing.label,
        scenes: storyboard.scenes.length,
        sceneSec: r2(DURATION / storyboard.scenes.length),
        authoredPerScene: stats.elementsPerScene,
        framesShot: frames,
        paintedPerFrame: frames ? r1(elements / frames) : 0,
        charsPerFrame: frames ? r1(chars / frames) : 0,
        inkPct: frames ? r1((ink / frames) * 100) : 0,
        thinFrames: thin,
        overlaps: over,
      });
      console.log(`  ${pacing.label.padEnd(11)} ${String(storyboard.scenes.length).padStart(3)} scenes  ->  `
        + `${String(rows[rows.length - 1].paintedPerFrame).padStart(5)} painted text box(es)/frame, `
        + `${String(rows[rows.length - 1].charsPerFrame).padStart(6)} chars/frame, `
        + `ink ${rows[rows.length - 1].inkPct}%`);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  if (!rows.length) { console.error("\nnothing rendered"); process.exit(1); }

  const pad = (v, n) => String(v).padStart(n);
  console.log(`\n  ${"".padEnd(24)}${rows.map((r) => pad(r.label, 13)).join("")}`);
  console.log(`  ${"-".repeat(24 + 13 * rows.length)}`);
  const line = (name, k, f = (v) => v) => console.log(`  ${name.padEnd(24)}${rows.map((r) => pad(f(r[k]), 13)).join("")}`);
  line("scenes", "scenes");
  line("scene duration", "sceneSec", (v) => `${v}s`);
  line("authored elements/scene", "authoredPerScene");
  line("PAINTED boxes/frame", "paintedPerFrame");
  line("PAINTED chars/frame", "charsPerFrame");
  line("text ink %", "inkPct", (v) => `${v}%`);
  line("frames with <=1 box", "thinFrames");
  line("overlapping text boxes", "overlaps");

  const by = Object.fromEntries(rows.map((r) => [r.mode, r]));
  let bad = 0;
  const ck = (ok, t) => { if (!ok) bad++; console.log(`    ${ok ? "ok  " : "FAIL"}  ${t}`); };
  console.log("\n  VERDICT");
  if (by["very-fast"] && by.normal) {
    ck(by["very-fast"].paintedPerFrame >= by.normal.paintedPerFrame * 0.85,
      `very-fast paints comparably to normal (${by["very-fast"].paintedPerFrame} vs ${by.normal.paintedPerFrame} boxes/frame)`);
    ck(by["very-fast"].charsPerFrame >= by.normal.charsPerFrame * 0.6,
      `very-fast frames still carry real copy (${by["very-fast"].charsPerFrame} vs ${by.normal.charsPerFrame} chars/frame)`);
  }
  ck(rows.every((r) => r.thinFrames === 0), `no pace paints a near-empty frame (${rows.map((r) => r.thinFrames).join("/")})`);
  // OVERLAP IS REPORTED, NOT GATED. Measured on `alchemy` at 1080x1920, the same
  // single overlap appears with the density system OFF as with it on (it simply
  // lands on a different beat), so it is a property of the pack's own layout and
  // not something more copy introduced. Failing the run on it would make this
  // probe red for a defect it did not find and cannot fix here — but a SILENT
  // overlap count is how "avoid overlapping text" stops being true, so it stays
  // on the table and says so out loud.
  const ov = rows.reduce((a, r) => a + r.overlaps, 0);
  console.log(`    ${ov ? "warn" : "ok  "}  ${ov ? `${ov} overlapping text box(es) across ${rows.length} paces (${rows.map((r) => r.overlaps).join("/")}) — compare against --baseline before blaming the copy` : "no text overlaps another"}`);
  console.log(`\n  PNGs: ${OUT}\n`);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ pack: PACK, renderer, W, H, job: job.id, baseline: BASELINE, rows }, null, 2));
  process.exit(bad ? 1 : 0);
})();
