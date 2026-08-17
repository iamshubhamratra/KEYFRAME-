// TEMPLATE MEDIA — the two tiers of "show me what this template actually renders".
//
// A template that cannot show itself is not finished. `/api/frames` hands the picker a
// `posterUrl` and a `previewUrl` per pack (routes/frames.js `mediaUrls`), and a card with a
// generic placeholder behind it is worse than no card: it advertises a design the renderer
// cannot produce. So the admin publish gate treats missing media as BLOCKING, and this module
// is the only thing that can clear it.
//
// TWO TIERS, because the two questions cost two different amounts:
//
//   TIER 1 — makeStills()      "does the composition I just generated LOOK right?"
//     Puppeteer screenshots taken straight off the built HTML timeline. No MP4 encode, no
//     hyperframes, no Chromium download. Seconds. Run it as often as the generate -> fix ->
//     regenerate loop needs. Lands in server/template_work/<slug>/ — ADMIN-ONLY working
//     artifacts, deliberately NOT in the public pack gallery (see the note on WORK below).
//
//   TIER 2 — makePackMedia()   "cut the shop window this template will be sold with"
//     One real render through the production path, then poster.jpg + preview.mp4 + media.json
//     into server/public/frames/<slug>/. Minutes. Run ONCE, at publish time.
//
// ONE FIXTURE FOR EVERY PACK. Both tiers compose the same neutral fixture the other 135 packs
// were shot with (title "Northwind", five beats, grey placeholder pictures), imported from
// scripts/make-pack-media.js rather than copied. That is not tidiness — it is correctness in
// two directions:
//   (a) a user comparing two picker cards must be comparing two DESIGNS, not two copywriters;
//   (b) `npm run test:pack-media` recomputes the composition hash with that module's own
//       buildForHash() and fails any pack whose media.json disagrees. A second, drifting copy
//       of the fixture here would make every template this module generates fail that guard on
//       the next run, with a diff nobody could read.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT INHERIT FROM scripts/make-pack-media.js
// (each verified against the file, and each one a real bug in the CLI today):
//
//   1. buildPack() calls `posterFrame(previewPath, FIXTURE.scenes)` but the function signature
//      is posterFrame(video, scenes, PACK) — the third argument is missing. groundOf(pack)
//      therefore reads a manifest for `undefined`, returns null, every groundGap is Infinity,
//      and the "the card must sit on the pack's own surface" rule — the whole reason that
//      function grew its second and third passes — is DEAD on every normal run. Only the
//      `--poster-only` path (line ~498) passes it. posterFrameFor() below takes the slug as a
//      required first argument so the mistake cannot be repeated by omission.
//   2. It writes ONLY index.html into the job dir. Every production render path also writes
//      meta.json (pipeline.js does, scripts/shot-pack.js does), and a composer that reads its
//      own meta at runtime therefore renders differently under the CLI than it does for a
//      customer. We write both.
//   3. It works in server/jobs/_packmedia/<pack> — a FIXED path with no locking, so two
//      concurrent generations write each other's index.html; and that path is under jobsDir,
//      where services/janitor.js (JOB_DIR_TTL_MS = 1h) deletes any directory whose db record is
//      null. These directories never have a db record, so the janitor will delete one mid-render
//      given a slow enough machine. We work under paths.workDir(slug) — WORK_ROOT is outside
//      both jobsDir and videosDir — and serialize the whole tier behind one promise chain.
//   4. Its render lands in server/public/videos/_pm-<pack>.mp4 and stays there, competing with
//      real user films for the janitor's videosDir budget, plus a fire-and-forget thumbnail JPEG
//      alongside it. renderer.render() is not parameterisable on that destination and we may not
//      edit it, so evacuateRender() moves the file out immediately and sweeps the stray thumb.
//   5. film_stage.js sets a MODULE-LEVEL `TSCALE` inside build() (line ~704, per build) and 89
//      film-* packs share that engine. Two concurrent buildComposition() calls therefore race on
//      one global and can type-scale each other's film. EVERY build in this module — both tiers —
//      goes through buildGate, a single-slot chain.
//
// EVERY WRITE HERE IS ASSERTED. Files we write ourselves go through paths.safeWrite; files an
// external process writes (ffmpeg's jpg/mp4, puppeteer's png) get paths.assertWritable on the
// destination first, because the containment guarantee has to hold for the path we HAND OUT as
// much as for the bytes we put down.

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFile } = require("node:child_process");

const config = require("../config");
const paths = require("./paths");
const frameRegistry = require("../services/frame_registry");
const frameManifest = require("../services/frame_manifest");
const { composerModuleFor } = require("../services/pipeline");
const { render } = require("../services/renderer");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the shared fixture

// scripts/make-pack-media.js is SAFE TO REQUIRE: its module body only requires other modules,
// and every side effect is behind `if (require.main === module)`. Required lazily all the same,
// so a deployment that ships src/ without scripts/ still boots — it simply cannot generate
// template media, which is an admin feature, rather than failing at startup for everyone.
let _packMediaKit = null;
function packMediaKit() {
  if (_packMediaKit) return _packMediaKit;
  try {
    _packMediaKit = require("../../scripts/make-pack-media.js");
  } catch (err) {
    const e = new Error(
      `template media needs scripts/make-pack-media.js for the shared fixture and composition hash `
      + `(${String(err.message).slice(0, 160)})`
    );
    e.code = "NO_MEDIA_KIT";
    e.status = 500;
    throw e;
  }
  return _packMediaKit;
}

// ---------------------------------------------------------------- serialization

// A single-slot chain. `run(fn)` waits for whatever is already queued, then runs fn — and the
// tail swallows fn's rejection so ONE failed template does not poison every later caller's
// queue (the caller still sees the rejection through the returned promise).
function makeGate(label) {
  let tail = Promise.resolve();
  let depth = 0;
  return {
    get pending() { return depth; },
    run(fn) {
      depth++;
      const result = tail.then(() => fn());
      tail = result.then(() => {}, () => {});
      result.then(() => { depth--; }, () => { depth--; });
      return result;
    },
    label,
  };
}

// Defect 5: film_stage's TSCALE is module-level state mutated inside build(). Both tiers build,
// so both tiers queue here. Builds are milliseconds, so the queue is never a bottleneck.
const buildGate = makeGate("build");
// Defect 3/4: one full render at a time. A render is minutes of Chromium at 1080p and the
// machine this runs on has already been observed dying at 0xC0000142 under commit pressure
// (see renderer.js) — two at once is how you get there.
const renderGate = makeGate("render");

// ---------------------------------------------------------------- small helpers

function abortError(where) {
  const e = new Error(`template media aborted during ${where}`);
  e.code = "ABORTED";
  e.status = 499;
  return e;
}
function throwIfAborted(signal, where) {
  if (signal && signal.aborted) throw abortError(where);
}

// The pack must exist in EITHER root. frame_registry.packDir() is the draft-aware resolver, so
// an unpublished template builds byte-identically to a published one — which is the entire
// point of the draft root: you can see what you are about to publish before anyone else can.
function requirePackDir(slug) {
  paths.assertSlug(slug);
  const dir = frameRegistry.packDir(slug);
  if (!dir) {
    const e = new Error(`no template pack directory for "${slug}" (looked in the published and draft roots)`);
    e.code = "PACK_MISSING";
    e.status = 404;
    throw e;
  }
  return dir;
}

function manifestOf(slug) { return frameManifest.getManifest(slug) || {}; }
function isPortrait(manifest) { return /portrait/i.test(String(manifest.orientation || "")); }
function dimsFor(manifest) {
  return isPortrait(manifest)
    ? { width: 1080, height: 1920, fps: 30 }
    : { width: 1920, height: 1080, fps: 30 };
}

// THE URL CARRIES THE FILE'S VERSION. Identical rule to routes/frames.js `stamped()`, and for
// the identical reason: these paths are constant and public/frames/*.mp4 is served with
// `Cache-Control: public, max-age=3600`, so a regenerated card keeps showing the old design for
// an hour from the browser cache and indefinitely from any proxy. The mtime in the query string
// makes new bytes a new URL. Stills need it MORE than posters do, because the admin regenerates
// them several times a minute while iterating.
function stampedUrl(prefix, abs) {
  let stat;
  try { stat = fs.statSync(abs); } catch { return null; }
  return `${prefix}?v=${Math.round(stat.mtimeMs)}`;
}

// ---------------------------------------------------------------- placeholder pictures
//
// COPIED, KNOWINGLY, from scripts/make-pack-media.js (uiPlaceholder / ASSET_SHAPES / the logo
// mark), which exports none of them. Two things make the copy tolerable where a copy of the
// FIXTURE would not be:
//
//   * it is hash-neutral. The composition hash covers indexHtml + metaJson, which are built from
//     the asset DESCRIPTORS (path, width, height, ratio, kindHint, cdScore) — never from the SVG
//     bytes. So drift between these two copies costs visual consistency with the other packs'
//     cards, and can never fail `npm run test:pack-media` with an unreadable hash mismatch.
//   * the descriptors themselves are not copied at all: buildForHash() below produces the HTML
//     from that module's own assetDescriptors(), so the thing the hash depends on has exactly one
//     definition.
//
// LEAD: exporting `writeAssets` from scripts/make-pack-media.js deletes this whole section. I
// did not edit that file because it is outside my assignment.
//
// Why the placeholder looks like this (preserved from the original, because the reasoning is the
// design): a flat grey wireframe was honest about being a stand-in and wrong on a poster — on
// eight packs it became the loudest object on the card. It needs the STRUCTURE and tonal range of
// a page (chrome, hero, tiles, text at varying measure) while carrying no brand and no words, and
// its palette is desaturated slate/teal on purpose: a stand-in with real colour gets read as part
// of the pack's own palette, and there are 135 different accents for it to clash with. Every
// dimension derives from w/h or an index — never a random source — so two runs write identical
// bytes and staleness stays meaningful.
function uiPlaceholder(w, h) {
  const wide = w / h >= 1.25;
  const P = Math.max(6, Math.round(Math.min(w, h) * 0.045));
  const barH = Math.max(14, Math.round(Math.min(h * 0.14, Math.min(w, h) * 0.12)));
  const top = barH + P;
  const bodyH = Math.max(10, h - top - P);
  const bodyW = w - P * 2;
  const heroH = Math.round(bodyH * (wide ? 0.46 : 0.34));
  const heroR = Math.round(Math.min(w, h) * 0.02);
  const hy = top + Math.round(heroH * 0.3), hbH = Math.max(4, Math.round(heroH * 0.11));
  const hero = `<rect x="${P}" y="${top}" width="${bodyW}" height="${heroH}" rx="${heroR}" fill="url(#pmHero)"/>
    <rect x="${P * 2}" y="${hy}" width="${Math.round(bodyW * 0.46)}" height="${hbH}" rx="${Math.round(hbH / 2)}" fill="#FFFFFF" opacity="0.86"/>
    <rect x="${P * 2}" y="${hy + Math.round(hbH * 2)}" width="${Math.round(bodyW * 0.29)}" height="${Math.max(3, Math.round(hbH * 0.62))}" rx="2" fill="#FFFFFF" opacity="0.5"/>
    <rect x="${P * 2}" y="${hy + Math.round(hbH * 3.7)}" width="${Math.round(bodyW * 0.13)}" height="${Math.max(5, Math.round(hbH * 1.1))}" rx="${Math.round(hbH * 0.55)}" fill="#E3B279" opacity="0.9"/>`;
  const tileTop = top + heroH + P;
  const tileH = bodyH - heroH - P;
  const cols = wide ? 3 : 2;
  const gap = P;
  const tileW = Math.round((bodyW - gap * (cols - 1)) / cols);
  const picH = Math.round(tileH * 0.6);
  const lineH = Math.max(3, Math.round(tileH * 0.075));
  // The tile row only exists when there is room for one — the widest asset shape is a 4.2:1 strip.
  const tiles = tileH < Math.min(w, h) * 0.16 ? "" : Array.from({ length: cols }, (_, i) => {
    const x = P + i * (tileW + gap);
    // Measures vary per column, from the index — a column of identical bars reads as a wireframe.
    const w1 = [0.82, 0.64, 0.73][i % 3], w2 = [0.45, 0.56, 0.38][i % 3];
    return `<rect x="${x}" y="${tileTop}" width="${tileW}" height="${tileH}" rx="${heroR}" fill="#FFFFFF"/>
      <rect x="${x}" y="${tileTop}" width="${tileW}" height="${picH}" rx="${heroR}" fill="url(#pmPic${i % 3})"/>
      <rect x="${x + P}" y="${tileTop + picH + Math.round(lineH * 1.2)}" width="${Math.round((tileW - P * 2) * w1)}" height="${lineH}" rx="2" fill="#94A3B1"/>
      <rect x="${x + P}" y="${tileTop + picH + Math.round(lineH * 3.1)}" width="${Math.round((tileW - P * 2) * w2)}" height="${lineH}" rx="2" fill="#C0CAD5"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="pmHero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F4A60"/><stop offset="1" stop-color="#527F8B"/></linearGradient>
      <linearGradient id="pmPic0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9FB4C1"/><stop offset="1" stop-color="#728E9E"/></linearGradient>
      <linearGradient id="pmPic1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#B3C3CC"/><stop offset="1" stop-color="#87A2AE"/></linearGradient>
      <linearGradient id="pmPic2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FA8B8"/><stop offset="1" stop-color="#B8C6CF"/></linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="#F3F6F9"/>
    <rect x="0" y="0" width="${w}" height="${barH}" fill="#FFFFFF"/>
    <rect x="0" y="${barH - 1}" width="${w}" height="1" fill="#E1E7ED"/>
    <rect x="${P}" y="${Math.round(barH * 0.34)}" width="${Math.round(barH * 0.9)}" height="${Math.round(barH * 0.32)}" rx="${Math.round(barH * 0.16)}" fill="#41627A"/>
    ${[0, 1, 2].map((i) => `<rect x="${P + Math.round(barH * 1.5) + i * Math.round(barH * 1.15)}" y="${Math.round(barH * 0.42)}" width="${Math.round(barH * 0.78)}" height="${Math.max(3, Math.round(barH * 0.16))}" rx="2" fill="#AFBCC7"/>`).join("")}
    ${hero}${tiles}
  </svg>`;
}

// The file names and pixel dimensions MUST match make-pack-media.js's ASSET_SHAPES exactly —
// these are the paths its assetDescriptors() puts into the composition, so a name that differs
// here is an <img> that 404s in the render and a beat that silently falls back to its
// pictureless layout.
const ASSET_SHAPES = Object.freeze([
  { file: "pm-wide.svg", w: 1600, h: 900 },
  { file: "pm-wide2.svg", w: 1600, h: 900 },
  { file: "pm-strip.svg", w: 1728, h: 410 },
  { file: "pm-tall.svg", w: 1000, h: 1250 },
  { file: "pm-square.svg", w: 1200, h: 1200 },
  { file: "pm-card.svg", w: 998, h: 367 },
]);

// A mark for the packs whose closing beat takes a logo: a ring and an N, in the same neutral grey.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><circle cx="200" cy="200" r="150" fill="none" stroke="#5B616E" stroke-width="26"/><path d="M150 268V132l100 136V132" fill="none" stroke="#5B616E" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function writePlaceholderAssets(dir) {
  for (const a of ASSET_SHAPES) paths.safeWrite(path.join(dir, a.file), uiPlaceholder(a.w, a.h));
  paths.safeWrite(path.join(dir, "pm-logo.svg"), LOGO_SVG);
}

// ---------------------------------------------------------------- the composition

// Build the fixture composition for a slug, serialized (defect 5), reusing the pack-media kit's
// own buildForHash() so the HTML we render and the hash we stamp come from ONE definition. If
// they came from two, `npm run test:pack-media` would report "the card shows a design the pack no
// longer renders" for a card that was correct.
async function buildFixtureComposition(slug) {
  const kit = packMediaKit();
  return buildGate.run(() => {
    const manifest = manifestOf(slug);
    const renderer = String(manifest.renderer || "");
    // A precise precondition beats buildForHash's bare null. "renderer film-x resolves to no
    // composer" is actionable; "composer produced nothing" sends the admin to the wrong file.
    if (renderer && !composerModuleFor(renderer)) {
      const e = new Error(`template "${slug}" declares renderer "${renderer}", which resolves to no composer module`);
      e.code = "NO_COMPOSER";
      e.status = 409;
      throw e;
    }
    let built;
    try {
      built = kit.buildForHash(slug);
    } catch (err) {
      const e = new Error(`buildComposition threw for "${slug}": ${String(err.message).slice(0, 240)}`);
      e.code = "BUILD_FAILED";
      e.status = 409;
      throw e;
    }
    if (!built || !built.indexHtml) {
      const e = new Error(`composer for "${slug}" produced no indexHtml`);
      e.code = "BUILD_EMPTY";
      e.status = 409;
      throw e;
    }
    return built;
  });
}

// Lay a complete, renderable job directory down: placeholder pictures, index.html AND meta.json.
// Defect 2 — the CLI omits meta.json, so a composer that reads its own meta at runtime behaves
// differently under the CLI than it does for a paying customer, and the card would advertise the
// wrong behaviour.
async function stageJobDir(slug, jobDir) {
  paths.assertWritable(jobDir);
  fs.rmSync(jobDir, { recursive: true, force: true });
  fs.mkdirSync(jobDir, { recursive: true });
  writePlaceholderAssets(jobDir);
  const built = await buildFixtureComposition(slug);
  paths.safeWrite(path.join(jobDir, "index.html"), built.indexHtml);
  if (built.metaJson) paths.safeWrite(path.join(jobDir, "meta.json"), built.metaJson);
  return built;
}

// ---------------------------------------------------------------- TIER 1 · stills

// Chromium lookup — IMPORTED from services/runtime_check, not inlined.
//
// The original comment here argued this was "a filesystem lookup, not logic that can drift", and
// that importing it would couple the admin surface to the framecheck CLI. The second half was
// simply wrong — the helper is exported from src/services/runtime_check.js, which server code
// already imports — and the first half was disproved by the copies themselves: three existed, and
// this was the only one that knew about Apple silicon while all three ordered versions lexically.
// The consolidated version adds the arm64 path this copy contributed and fixes the ordering for
// every caller.
const { findChromium } = require("../services/runtime_check");

// A composition loads GSAP from a CDN, and `file://` is a hostile origin for that: Chrome applies
// opaque-origin rules, the script never executes, gsap.timeline() throws, the timeline never
// registers and EVERY STILL IS BLANK. The real renderer serves the job dir over localhost, so
// this does too. (Same reasoning, and the same code shape, as scripts/shot-pack.js serveDir.)
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2", ".woff": "font/woff",
};
function serveDir(dir) {
  const rootResolved = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/" || p === "") p = "/index.html";
    // Chrome asks for a favicon on every navigation and a job dir never has one. Answering 204
    // rather than 404 keeps the page-error list SIGNAL: a 404 that fires on every template for
    // every pack trains the reviewer to ignore the one warning line that matters (a font or a
    // script that genuinely failed to load, which silently swaps the pack's display face).
    if (p === "/favicon.ico") { res.statusCode = 204; return res.end(); }
    const file = path.resolve(path.join(rootResolved, p));
    if (!file.startsWith(rootResolved)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (e, buf) => {
      if (e) { res.statusCode = 404; return res.end(); }
      res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

// WHICH MOMENTS TO SHOOT. Not evenly spaced across the clip — an even split lands inside cut
// transitions, and a still caught mid-wipe shows two headlines at once and reads as a layout bug
// that is not there (the same finding that moved make-pack-media's poster sampling off 0.94).
// So: one shot per beat, taken 62% of the way through it when the beat's type has landed and its
// exit has not started. More shots than beats adds a second, earlier pass at 32%.
function shotTimes(scenes, count) {
  const beats = (scenes || []).filter((s) => Number(s.duration) > 0);
  if (!beats.length) return [0];
  const at = (s, f) => +(Number(s.start) + Number(s.duration) * f).toFixed(2);
  const primary = beats.map((s) => at(s, 0.62));
  // More shots than beats: add a second, earlier pass so a long beat is sampled twice.
  const pool = count <= primary.length
    ? primary
    : [...primary, ...beats.map((s) => at(s, 0.32))].sort((a, b) => a - b);
  // SPREAD THE SELECTION ACROSS THE WHOLE FILM, WITH BOTH ENDS PINNED. Taking the first `count`
  // of the pool — what a `.slice(0, count)` does — hands back the opening beats and drops the
  // closing lockup. So does an open-ended `i * pool.length / count` step, which at count=2 or 3
  // stops one beat short. The close is the beat an admin most needs to see: it carries the CTA,
  // the logo and the address, and it is where a generated template most often has nothing at all.
  // Interpolating over `pool.length - 1 / count - 1` makes the first and last entries fixed points.
  const step = count > 1 ? (pool.length - 1) / (count - 1) : 0;
  const picked = Array.from({ length: count }, (_, i) => pool[Math.min(pool.length - 1, Math.round(i * step))]);
  // Round-off can land two indices on the same beat; de-duplicate so `count` stills are `count`
  // different moments rather than the same frame written twice under two names.
  return [...new Set(picked)];
}

/**
 * TIER 1 — fast stills straight off the built HTML timeline. No MP4 encode.
 * @returns {Promise<{stills: string[], dir: string, warnings: string[], times: number[], ms: number}>}
 */
async function makeStills({ slug, count = 4, signal } = {}) {
  const t0 = Date.now();
  requirePackDir(slug);
  const n = Math.max(1, Math.min(12, Math.round(Number(count) || 4)));
  const warnings = [];

  let puppeteer;
  try { puppeteer = require("puppeteer-core"); } catch {
    const e = new Error("puppeteer-core is not installed — cannot screenshot a template");
    e.code = "NO_PUPPETEER";
    e.status = 500;
    throw e;
  }
  const exe = findChromium();
  if (!exe) {
    const e = new Error("no cached Chromium found — set PUPPETEER_EXECUTABLE_PATH");
    e.code = "NO_CHROMIUM";
    e.status = 500;
    throw e;
  }

  throwIfAborted(signal, "still setup");

  const kit = packMediaKit();
  const manifest = manifestOf(slug);
  const dims = dimsFor(manifest);

  const work = paths.workDir(slug);
  const buildDir = paths.safeJoin(work, "build");
  const stillsDir = paths.safeJoin(work, "stills");
  paths.ensureWorkRoot();

  await stageJobDir(slug, buildDir);
  throwIfAborted(signal, "still build");

  // Wipe the previous pass. Stale stills are worse than none: the admin's whole reason for
  // looking is to see whether the last fix landed, and an old frame answers "yes" wrongly.
  paths.assertWritable(stillsDir);
  fs.rmSync(stillsDir, { recursive: true, force: true });
  fs.mkdirSync(stillsDir, { recursive: true });

  const times = shotTimes(kit.FIXTURE.scenes, n);

  // The server first, the browser second, and the browser launch inside its own guard: a launch
  // that throws (no shared libs, a half-downloaded Chromium) would otherwise strand a listening
  // socket for the life of the process, and the admin's next attempt strands another.
  const served = await serveDir(buildDir);
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: exe,
      headless: true,
      args: ["--no-sandbox", "--font-render-hinting=none", "--force-color-profile=srgb", "--hide-scrollbars"],
    });
  } catch (err) {
    served.server.close();
    throw err;
  }
  const files = [];
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`console: ${m.text().slice(0, 160)}`); });
    page.on("requestfailed", (r) => pageErrors.push(`request failed: ${r.url().slice(0, 90)}`));
    await page.setViewport({ width: dims.width, height: dims.height, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${served.port}/index.html`, { waitUntil: "load", timeout: 45_000 });

    // Our compositions register ONE paused GSAP timeline as window.__timelines.vid and, under
    // navigator.webdriver, deliberately do not autoplay — the exact contract `hyperframes render`
    // seeks against. Waiting for that registration is therefore also the runtime check: a script
    // that throws never registers.
    //
    // The predicate MUST return a boolean. Returning the timeline itself makes puppeteer try to
    // serialize a GSAP object full of circular references; that rejection reads exactly like
    // "the timeline never registered" for a timeline that registered fine.
    let seekable = true;
    await page.waitForFunction(() => !!(window.__timelines && window.__timelines.vid), { timeout: 20_000 })
      .catch(() => { seekable = false; });
    if (!seekable) {
      // Not fatal, and not silently fine either. Some packs paint from canvas layers driven only
      // by the renderer's `hf-seek` event, and those still shoot correctly below. A pack that has
      // NEITHER produces identical frames, which the admin can see at a glance — but they must be
      // told why, or they will read it as a design that does not animate.
      warnings.push(
        "no GSAP timeline registered (window.__timelines.vid) — frames were captured by dispatching "
        + "hf-seek only; if every still looks the same, the composition's script did not run"
        + (pageErrors.length ? `. First page error: ${pageErrors[0]}` : "")
      );
    }
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});

    for (const [i, t] of times.entries()) {
      throwIfAborted(signal, "still capture");
      await page.evaluate((time) => {
        const tl = window.__timelines && window.__timelines.vid;
        if (tl) { tl.pause(); tl.seek(time, false); }
        // Canvas layers paint from hf-seek, NOT from the timeline — the renderer dispatches this
        // on every seek, so a shot that skips it captures a blank backdrop over a correct film.
        window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time } }));
      }, t);
      // One frame for the canvas layers' rAF to land before the shutter.
      await delay(80);
      const name = `still-${String(i + 1).padStart(2, "0")}-t${String(t).replace(".", "_")}.png`;
      const file = paths.assertWritable(path.join(stillsDir, name));
      // PNG, not JPEG. These are read as DESIGN evidence, and JPEG ringing around display type is
      // precisely the artefact a reviewer would file as a rendering defect.
      await page.screenshot({ path: file, type: "png" });
      files.push({ name, file, t });
    }
    if (pageErrors.length) warnings.push(`${pageErrors.length} page error(s), first: ${pageErrors[0]}`);
    await page.close().catch(() => {});
  } finally {
    served.server.close();
    await browser.close().catch(() => {});
    // In the `finally`, not after it: an abort or a capture failure must not leave an index.html
    // and a set of SVGs sitting under the same static mount the stills are served from.
    try { paths.safeRmDir(buildDir); } catch { /* the next run rms it before rebuilding */ }
  }

  return {
    stills: files.map((f) => stampedUrl(`/template-work/${slug}/stills/${f.name}`, f.file)).filter(Boolean),
    dir: stillsDir,
    times: files.map((f) => f.t),
    warnings,
    ms: Date.now() - t0,
  };
}

// ---------------------------------------------------------------- ffmpeg

const FF = config.render?.ffmpegPath || process.env.FFMPEG_PATH || "ffmpeg";
function ff(args) {
  return new Promise((resolve, reject) => {
    execFile(FF, args, { maxBuffer: 1 << 26, encoding: "buffer" }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`ffmpeg ${args.slice(0, 6).join(" ")}…: ${String(stderr).slice(-400)}`));
      resolve(stdout);
    });
  });
}

// PREVIEW SHAPE. A picker card autoplays several clips in a grid, so: ~8s, muted, one pass of the
// pack's vocabulary, ~450kb. `-an` because a grid autoplays muted and an audio track is bytes
// nobody can hear; `+faststart` so the card can begin playing before the file finishes arriving.
const PREVIEW_LONG_EDGE = 960;
const PREVIEW_CRF = 30;
const POSTER_LONG_EDGE = 1280;

async function encodePreview(src, dest, portrait) {
  paths.assertWritable(dest);
  const scale = portrait ? `scale=-2:${PREVIEW_LONG_EDGE}` : `scale=${PREVIEW_LONG_EDGE}:-2`;
  await ff(["-y", "-hide_banner", "-loglevel", "error", "-i", src,
    "-vf", scale, "-an", "-c:v", "libx264", "-preset", "veryslow", "-crf", String(PREVIEW_CRF),
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", dest]);
}

async function encodePoster(src, dest, at, portrait) {
  paths.assertWritable(dest);
  const scale = portrait ? `scale=-2:${POSTER_LONG_EDGE}` : `scale=${POSTER_LONG_EDGE}:-2`;
  await ff(["-y", "-hide_banner", "-loglevel", "error", "-ss", String(at), "-i", src,
    "-frames:v", "1", "-vf", scale, "-q:v", "3", dest]);
}

// ---------------------------------------------------------------- poster frame choice

const POSTER_FLOOR = 26;    // below this the frame is near-black — an empty-looking card
const DETAIL_FLOOR = 14;    // below this it is near-uniform: a bare page, or one flat slab
const GROUND_TOLERANCE = 105; // further than this from the declared surface is a different ground

async function sampleAt(video, t) {
  try {
    const buf = await ff(["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=8:8,format=rgb24", "-f", "rawvideo", "-"]);
    if (buf.length < 192) return { luma: 0, detail: 0, rgb: null };
    const lum = [], rgb = [0, 0, 0];
    for (let i = 0; i < 192; i += 3) {
      const r = buf[i], g = buf[i + 1], b = buf[i + 2];
      rgb[0] += r; rgb[1] += g; rgb[2] += b;
      lum.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
    const n = 64;
    const mean = lum.reduce((a, b) => a + b, 0) / n;
    const detail = Math.sqrt(lum.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
    return { luma: Math.round(mean), detail: Math.round(detail), rgb: rgb.map((c) => Math.round(c / n)) };
  } catch { return { luma: -1, detail: -1, rgb: null }; }
}

// THE CARD MUST SIT ON THE TEMPLATE'S OWN SURFACE. Which BEAT inverts the ground differs per
// pack, so beat order alone cannot express this — the manifest already states the answer, so
// read it. (This is the input make-pack-media.js's buildPack() forgets to pass; see defect 1.)
function groundOf(slug) {
  const m = manifestOf(slug);
  const hex = (m.surface && m.surface.ground) || (m.colors && (m.colors.ground || m.colors.paper || m.colors.bg));
  if (typeof hex !== "string") return null;
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return null;
  const rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return rgb.every((c) => Number.isFinite(c)) ? rgb : null;
}
const groundDistance = (rgb, ground) => (!rgb || !ground ? Infinity
  : Math.sqrt((rgb[0] - ground[0]) ** 2 + (rgb[1] - ground[1]) ** 2 + (rgb[2] - ground[2]) ** 2));

// `slug` is the FIRST parameter, and required. In make-pack-media.js the equivalent argument is
// third and optional-by-accident, which is how the whole declared-ground rule below came to be
// dead code on every normal run. Put it where it cannot be forgotten.
async function posterFrameFor(slug, video, scenes) {
  const first = scenes[0], last = scenes[scenes.length - 1];
  const mid = scenes.slice(1, -1);
  // WHAT MAKES A GOOD CARD, in preference order:
  //   1. A TYPE-LED BEAT first. The fixture's figures / quote / closing beats carry no picture,
  //      so they show the template's own type and furniture. On a dark pack a flat light
  //      placeholder is the brightest object in the frame, and the card ends up selling a
  //      wireframe. The PREVIEW still shows the picture beats; the CARD does not have to.
  //   2. INSIDE the beat, never at its edge — 0.62-0.8 through is clear of both cuts.
  //   3. FIRST ACCEPTABLE, not most detailed. Maximising detail globally drags packs onto
  //      atypical frames; the two floors below only REJECT a bad card.
  const candidates = [
    ...mid.slice(1).map((sc) => sc.start + sc.duration * 0.66),   // figures / quote: type-led
    last.start + last.duration * 0.62,                            // the closing lockup
    first.start + first.duration * 0.8,                           // the opening, mostly landed
    ...mid.slice(0, 1).map((sc) => sc.start + sc.duration * 0.66), // the picture beat, last resort
  ].map((t) => +t.toFixed(2));

  const ground = groundOf(slug);
  const scored = [];
  for (const t of candidates) {
    const s = { t, ...(await sampleAt(video, t)) };
    s.groundGap = Math.round(groundDistance(s.rgb, ground));
    scored.push(s);
  }

  const onBrief = scored.find((s) => s.luma >= POSTER_FLOOR && s.detail >= DETAIL_FLOOR && s.groundGap <= GROUND_TOLERANCE);
  if (onBrief) return onBrief;

  // Nothing inside the tolerance: take the CLOSEST to the declared surface among frames that
  // clear the darkness floor — not the first in preference order. The detail floor is dropped
  // deliberately here: early in a beat little type has landed, so a frame that IS on the pack's
  // parchment scores low on detail and would never reach this comparison. Being on the right
  // surface matters more to a card than being busy; detail only breaks ties.
  const usable = scored.filter((s) => s.luma >= POSTER_FLOOR);
  if (usable.length) {
    return usable.reduce((a, b) => (b.groundGap < a.groundGap || (b.groundGap === a.groundGap && b.detail > a.detail) ? b : a));
  }
  // A genuinely dark template. Take the LEAST dark, not the most detailed — on a near-black
  // frame "detail" is mostly encoder noise.
  return scored.reduce((a, b) => (b.luma > a.luma ? b : a));
}

// ---------------------------------------------------------------- TIER 2 · full media

// Defect 4. renderer.render() is hard-wired to move its output into config.paths.videosDir and to
// kick off a fire-and-forget gallery thumbnail beside it; the destination is not a parameter and
// renderer.js is outside this task's remit. So the file is evacuated the instant render()
// resolves, before the janitor can count it against the 500MB videos budget.
//
// The rename is retried: generateThumbnail() has already spawned ffmpeg against that exact path,
// and on Windows an open handle makes the rename fail EBUSY/EPERM for a moment. Once the source
// is gone those ffmpeg calls fail and the stray .jpg is usually never created at all — the sweep
// below is for the case where it won the race.
async function evacuateRender(videoPath, dest) {
  paths.assertWritable(dest);
  let lastErr = null;
  for (let i = 0; i < 12; i++) {
    try { fs.renameSync(videoPath, dest); lastErr = null; break; }
    catch (e) {
      lastErr = e;
      if (e.code !== "EBUSY" && e.code !== "EPERM" && e.code !== "EACCES") break;
      await delay(250);
    }
  }
  if (lastErr) {
    // Cross-device, or a handle that never closed: copy then unlink, so the file still leaves
    // videosDir even if it could not be moved atomically.
    fs.copyFileSync(videoPath, dest);
    try { fs.unlinkSync(videoPath); } catch { /* swept below */ }
  }
  const strayThumb = videoPath.replace(/\.mp4$/, ".jpg");
  for (let i = 0; i < 6; i++) {
    try { fs.unlinkSync(strayThumb); break; } catch { /* not written (yet) */ }
    await delay(300);
  }
  try { fs.unlinkSync(videoPath); } catch { /* already moved */ }
}

/**
 * TIER 2 — the real shop window. ONE render, then poster.jpg + preview.mp4 + media.json into
 * server/public/frames/<slug>/, which is exactly where routes/frames.js reads posterUrl and
 * previewUrl from. Minutes. Publish-time only.
 * @returns {Promise<{posterUrl:string, previewUrl:string, mediaJson:object, durationMs:number}>}
 */
async function makePackMedia({ slug, signal } = {}) {
  requirePackDir(slug);
  // The whole tier is one slot (defects 3 and 5): a second concurrent full render would fight
  // this one for Chromium memory, and its build would race film_stage's module-level TSCALE.
  return renderGate.run(() => runPackMedia(slug, signal));
}

async function runPackMedia(slug, signal) {
  const t0 = Date.now();
  const kit = packMediaKit();
  const manifest = manifestOf(slug);
  const portrait = isPortrait(manifest);

  paths.ensureWorkRoot();
  const jobDir = paths.safeJoin(paths.workDir(slug), "media");

  throwIfAborted(signal, "media setup");
  const built = await stageJobDir(slug, jobDir);
  throwIfAborted(signal, "media build");

  // `_tpl-` rather than `_pm-`: this is a distinguishable owner in the videosDir listing for the
  // seconds the file spends there, and it can never collide with a real job id (job ids are uuids)
  // nor with the CLI's `_pm-<pack>` if someone runs both at once.
  const jobId = `_tpl-${slug}`;
  const { videoPath } = await render({
    jobId, jobDir, durationSec: kit.PREVIEW_SEC, abortSignal: signal,
  });

  const rawPath = paths.safeJoin(jobDir, "raw.mp4");
  await evacuateRender(videoPath, rawPath);
  throwIfAborted(signal, "media encode");

  const outDir = paths.packMediaDir(slug);
  paths.assertWritable(outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const previewPath = paths.safeJoin(outDir, "preview.mp4");
  const posterPath = paths.safeJoin(outDir, "poster.jpg");

  await encodePreview(rawPath, previewPath, portrait);
  // The poster is cut from the PREVIEW, not the raw render, so the frame on the card is a frame
  // of the clip the card plays. Cutting it from the raw file lets the two disagree after the
  // preview's rescale, which is visible as a card that "jumps" the moment it starts playing.
  const pick = await posterFrameFor(slug, previewPath, kit.FIXTURE.scenes);
  await encodePoster(previewPath, posterPath, pick.t, portrait);

  // STAMP THE MEDIA WITH THE COMPOSITION IT CAME FROM. `npm run test:pack-media` recomputes this
  // hash from the pack's CURRENT composer and fails the build when they differ — that is how the
  // suite knows a card is advertising a design the template no longer renders. The hash function
  // and the fixture are the pack-media kit's own, never a copy, so the two cannot drift.
  const mediaJson = {
    pack: slug,
    composition: kit.compositionHash(built),
    fixture: kit.FIXTURE.title,
    previewSec: kit.PREVIEW_SEC,
    posterAt: pick.t,
    posterLuma: pick.luma,
    posterDetail: pick.detail,
    posterGroundGap: Number.isFinite(pick.groundGap) ? pick.groundGap : null,
    generatedAt: new Date().toISOString(),
    generatedBy: "src/templates/media.js",
  };
  paths.safeWrite(path.join(outDir, "media.json"), `${JSON.stringify(mediaJson, null, 2)}\n`);

  // The raw render is 5-10x the preview and serves no further purpose; the placeholder SVGs and
  // the HTML are reproducible in milliseconds.
  paths.safeRmDir(jobDir);

  const status = mediaStatus(slug);
  // FAIL CLOSED. Everything above can succeed and still leave a file the route cannot serve — an
  // ffmpeg that exits 0 having written nothing, a full disk, a poster the encoder truncated. The
  // publish gate's contract is that "could not check" is a failure, so this asserts the artifacts
  // rather than reporting the intention to have made them.
  if (!status.hasPoster || !status.hasPreview || !status.hasMediaJson) {
    const missing = [
      !status.hasPoster && "poster.jpg",
      !status.hasPreview && "preview.mp4",
      !status.hasMediaJson && "media.json",
    ].filter(Boolean).join(", ");
    const e = new Error(`template media generation finished but ${missing} is missing from ${outDir}`);
    e.code = "MEDIA_INCOMPLETE";
    e.status = 500;
    throw e;
  }

  return {
    posterUrl: status.posterUrl,
    previewUrl: status.previewUrl,
    mediaJson,
    durationMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------- status

// What the publish gate asks. Synchronous and total: it never throws, and every failure mode —
// a slug that will not validate, a missing directory, an unreadable file — resolves to `false`.
// That is the fail-closed direction: an unanswerable question blocks a publish rather than
// waving it through, which is the one place in this codebase where fail-open is wrong.
//
// The size floors mirror scripts/test-pack-media.js: a poster under 4kb is a flat or near-black
// frame and a preview under 24kb cannot be eight seconds of anything, so both are treated as
// absent here rather than passing the gate and failing the suite later.
const MIN_POSTER_BYTES = 4 * 1024;
const MIN_PREVIEW_BYTES = 24 * 1024;

function mediaStatus(slug) {
  const blank = { hasPoster: false, hasPreview: false, hasMediaJson: false, posterUrl: null, previewUrl: null };
  let dir;
  try { dir = paths.packMediaDir(slug); } catch { return blank; }

  const sizeOf = (file) => { try { const st = fs.statSync(file); return st.isFile() ? st.size : -1; } catch { return -1; } };
  const posterPath = path.join(dir, "poster.jpg");
  const previewPath = path.join(dir, "preview.mp4");
  const mediaPath = path.join(dir, "media.json");

  const hasPoster = sizeOf(posterPath) >= MIN_POSTER_BYTES;
  const hasPreview = sizeOf(previewPath) >= MIN_PREVIEW_BYTES;
  // Present is not enough — the guard reads `.composition` out of it, and a media.json without
  // one fails `npm run test:pack-media` ("media.json has no composition hash — regenerate").
  // Reporting it as present here would let a template publish straight into a red suite.
  let hasMediaJson = false;
  try { hasMediaJson = !!JSON.parse(fs.readFileSync(mediaPath, "utf8")).composition; } catch { hasMediaJson = false; }

  return {
    hasPoster,
    hasPreview,
    hasMediaJson,
    posterUrl: hasPoster ? stampedUrl(`/frames/${slug}/poster.jpg`, posterPath) : null,
    previewUrl: hasPreview ? stampedUrl(`/frames/${slug}/preview.mp4`, previewPath) : null,
  };
}

module.exports = { makeStills, makePackMedia, mediaStatus };
