// PACK MEDIA — regenerate each frame pack's shop window from the pack's OWN composer.
//
// WHY THIS EXISTS. `/api/frames` hands the picker a `posterUrl` and a `previewUrl` per pack, served
// from public/frames/<pack>/{poster.jpg,preview.mp4}. Every pack had both — but they were hand-made
// design mocks, and **33 of the 46 were older than the composer they claim to show**. Ten of those
// packs had NO COMPOSER AT ALL until today, so their preview advertised a design the renderer could
// not produce. A picker that lies about what you will get is worse than one that shows nothing.
//
// So the poster and the preview are now RENDERED, by the pack, through the real render path.
//
// ONE FIXTURE FOR EVERY PACK, deliberately. Each preview gets the same neutral brand, the same copy
// and the same placeholder pictures, so a user comparing two cards in the picker is comparing the two
// DESIGNS and nothing else. If each pack advertised itself with its own bespoke copy, the picker
// would be measuring the copywriting.
//
// The placeholders read as a plain product UI in neutral grey — never a blueprint grid or a bright
// stand-in colour, both of which get mistaken for part of the pack's design.
//
// Usage:
//   node scripts/make-pack-media.js --stale          # only packs whose media predates their composer
//   node scripts/make-pack-media.js --pack noir-spotlight [--pack drive]
//   node scripts/make-pack-media.js --all [--limit 5]
//   node scripts/make-pack-media.js --stale --dry-run

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const config = require("../src/config");
const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");
const { render } = require("../src/services/renderer");

const PUBLIC_FRAMES = path.join(__dirname, "..", "public", "frames");
const WORK = path.join(__dirname, "..", "jobs", "_packmedia");

// PREVIEW SHAPE. A picker card wants something small enough to autoplay in a grid: ~8s, muted, one
// pass of the pack's own vocabulary. The old files were ~4.5MB each with an audio track nobody can
// hear (a grid autoplays muted); these come out around a tenth of that.
const PREVIEW_SEC = 8.4;
const PREVIEW_LONG_EDGE = 960;       // 960x540 landscape, 540x960 portrait
const PREVIEW_CRF = 30;
const POSTER_LONG_EDGE = 1280;       // crisp on a retina card; the route serves it as-is

// ---- the fixture -------------------------------------------------------------
// Neutral, plausible, and identical for every pack. Five beats so a six-role spine still shows its
// opening, a picture beat, its figures and its close.
const FIXTURE = {
  title: "Northwind",
  url: "northwind.app",
  durationSec: PREVIEW_SEC,
  scenes: [
    { id: "p1", start: 0, duration: 1.9, kind: "hook", purpose: "intro", headline: "Everything in one place", subtext: "The workspace your team actually opens.", emphasis: "New", kicker: "Introducing" },
    { id: "p2", start: 1.9, duration: 1.7, kind: "feature", purpose: "feature", headline: "One clear view", subtext: "Plans, work and hand-offs on a single surface.", onScreenText: ["Real-time", "Shared", "Simple"], kicker: "What it does" },
    { id: "p3", start: 3.6, duration: 1.7, kind: "stat", purpose: "result", headline: "Six hours back a week", emphasis: "6h", subtext: "92% still use it after a year, rated 4.9 out of 5.", kicker: "By the numbers" },
    { id: "p4", start: 5.3, duration: 1.6, kind: "quote", purpose: "testimonial", headline: "The first tool nobody complained about", quote: "The first tool nobody complained about.", attribution: "Head of Operations", subtext: "Head of Operations", kicker: "Customers" },
    { id: "p5", start: 6.9, duration: 1.5, kind: "cta", purpose: "cta", headline: "Start with Northwind", emphasis: "Start free", subtext: "northwind.app", kicker: "Get started" },
  ],
};

// A placeholder that reads as a product UI at thumbnail size: header bar, sidebar, a few cards. Flat
// neutral greys only — a coloured stand-in gets read as part of the pack's palette.
function uiPlaceholder(w, h) {
  const pad = Math.round(Math.min(w, h) * 0.05);
  const barH = Math.round(h * 0.11);
  const sideW = Math.round(w * 0.2);
  const cardTop = barH + pad;
  const cardH = Math.max(8, Math.round((h - cardTop - pad * 2) / 3));
  const cards = [0, 1, 2].map((i) => `<rect x="${sideW + pad * 2}" y="${cardTop + i * (cardH + pad)}" width="${w - sideW - pad * 3}" height="${cardH}" rx="${Math.round(cardH * 0.14)}" fill="#C6CBD4"/>`).join("");
  const rows = [0, 1, 2, 3].map((i) => `<rect x="${pad * 1.5}" y="${cardTop + i * (barH * 0.75)}" width="${sideW - pad}" height="${Math.round(barH * 0.34)}" rx="4" fill="#B9BFC9"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="#D5D9E0"/>
    <rect x="0" y="0" width="${w}" height="${barH}" fill="#E4E7EC"/>
    <rect x="${pad}" y="${Math.round(barH * 0.32)}" width="${Math.round(w * 0.16)}" height="${Math.round(barH * 0.36)}" rx="6" fill="#A9B0BB"/>
    <rect x="0" y="${barH}" width="${sideW}" height="${h - barH}" fill="#E4E7EC"/>
    ${rows}${cards}
  </svg>`;
}

const ASSET_SHAPES = [
  { path: "pm-wide.svg", w: 1600, h: 900, ratio: 1600 / 900, kindHint: "screenshot", cdProminence: "hero", cdScore: 0.94 },
  { path: "pm-wide2.svg", w: 1600, h: 900, ratio: 1600 / 900, kindHint: "screenshot", cdProminence: "support", cdScore: 0.86 },
  { path: "pm-strip.svg", w: 1728, h: 410, ratio: 1728 / 410, kindHint: "screenshot", cdProminence: "support", cdScore: 0.8 },
  { path: "pm-tall.svg", w: 1000, h: 1250, ratio: 1000 / 1250, kindHint: "screenshot", cdProminence: "support", cdScore: 0.74 },
  { path: "pm-square.svg", w: 1200, h: 1200, ratio: 1, kindHint: "photo", cdProminence: "support", cdScore: 0.68 },
  { path: "pm-card.svg", w: 998, h: 367, ratio: 998 / 367, kindHint: "illustration", cdProminence: "support", cdScore: 0.62 },
];

function writeAssets(dir) {
  const out = [];
  for (const a of ASSET_SHAPES) {
    fs.writeFileSync(path.join(dir, a.path), uiPlaceholder(a.w, a.h), "utf8");
    out.push({
      path: a.path, type: "image", width: a.w, height: a.h, ratio: a.ratio,
      source: "website", kindHint: a.kindHint, cdProminence: a.cdProminence, cdScore: a.cdScore,
      visionOk: true, alt: "product interface",
    });
  }
  // A mark for the packs whose closing beat takes a logo. A ring and an N, in the same neutral grey.
  fs.writeFileSync(path.join(dir, "pm-logo.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><circle cx="200" cy="200" r="150" fill="none" stroke="#5B616E" stroke-width="26"/><path d="M150 268V132l100 136V132" fill="none" stroke="#5B616E" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/></svg>`, "utf8");
  out.push({ path: "pm-logo.svg", type: "image", width: 400, height: 400, ratio: 1, source: "website-brand", role: "logo", alt: "logo" });
  return out;
}

// ---- ffmpeg ------------------------------------------------------------------
const FF = config.render?.ffmpegPath || process.env.FFMPEG_PATH || "ffmpeg";
function ff(args) {
  return new Promise((resolve, reject) => {
    execFile(FF, args, { maxBuffer: 1 << 26, encoding: "buffer" }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`ffmpeg ${args.slice(0, 6).join(" ")}…: ${String(stderr).slice(-400)}`));
      resolve(stdout);
    });
  });
}

// THE POSTER SHOWS THE PACK'S TYPE, NOT ITS PLACEHOLDER. The first version of this took the
// BRIGHTEST sampled frame — the rule renderer.js uses for gallery thumbnails, which is right there
// (a user's own film) and wrong here. On a dark pack the brightest frame is whichever one the grey
// placeholder fills, so the picker card became two grey bars with a headline above them: the least
// representative frame in the film, chosen deliberately.
//
// So candidates are ORDERED by what makes a good card — the opening beat once its type has landed,
// then the closing lockup, then the mid-film — and the first one that is not near-black wins. Luma is
// only a floor now, not the objective.
const POSTER_FLOOR = 26;
async function lumaAt(video, t) {
  try {
    const buf = await ff(["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=1:1,format=gray", "-f", "rawvideo", "-"]);
    return buf.length ? buf[0] : 0;
  } catch { return -1; }
}
async function posterFrame(video, scenes) {
  const first = scenes[0], last = scenes[scenes.length - 1];
  const candidates = [
    first.start + first.duration * 0.82,          // the opening, fully revealed
    last.start + last.duration * 0.7,             // the closing lockup
    first.start + first.duration * 0.6,
    ...scenes.slice(1, -1).map((sc) => sc.start + sc.duration * 0.7),
  ].map((t) => +t.toFixed(2));

  let best = candidates[0], bestLuma = -1;
  for (const t of candidates) {
    const luma = await lumaAt(video, t);
    if (luma > bestLuma) { bestLuma = luma; best = t; }
    if (luma >= POSTER_FLOOR) return { t, luma };   // first acceptable candidate, in preference order
  }
  return { t: best, luma: bestLuma };               // nothing clears the floor: take the least dark
}

async function encodePreview(src, dest, portrait) {
  const scale = portrait ? `scale=-2:${PREVIEW_LONG_EDGE}` : `scale=${PREVIEW_LONG_EDGE}:-2`;
  // -an: a picker grid autoplays muted, so an audio track is bytes nobody can hear.
  // +faststart: the moov atom up front, so the card can start playing before the file is complete.
  await ff(["-y", "-hide_banner", "-loglevel", "error", "-i", src,
    "-vf", scale, "-an", "-c:v", "libx264", "-preset", "veryslow", "-crf", String(PREVIEW_CRF),
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", dest]);
}

async function encodePoster(src, dest, at, portrait) {
  const scale = portrait ? `scale=-2:${POSTER_LONG_EDGE}` : `scale=${POSTER_LONG_EDGE}:-2`;
  await ff(["-y", "-hide_banner", "-loglevel", "error", "-ss", String(at), "-i", src,
    "-frames:v", "1", "-vf", scale, "-q:v", "3", dest]);
}

// ---- one pack ----------------------------------------------------------------
async function buildPack(pack, { dryRun }) {
  const manifest = fm.getManifest(pack) || {};
  const comp = composerModuleFor(manifest.renderer);
  if (!comp) return { pack, skipped: "no composer" };

  const portrait = /portrait/i.test(String(manifest.orientation || ""));
  const dims = portrait ? { width: 1080, height: 1920, fps: 30 } : { width: 1920, height: 1080, fps: 30 };

  const jobDir = path.join(WORK, pack);
  fs.rmSync(jobDir, { recursive: true, force: true });
  fs.mkdirSync(jobDir, { recursive: true });
  const assets = writeAssets(jobDir);

  const built = comp.buildComposition({
    storyboard: JSON.parse(JSON.stringify(FIXTURE)),
    dims, framePack: pack, assets, captionCues: [], brandSkin: null, seedKey: `packmedia-${pack}`,
  });
  if (!built || !built.indexHtml) return { pack, skipped: "composer produced nothing" };
  fs.writeFileSync(path.join(jobDir, "index.html"), built.indexHtml, "utf8");
  if (dryRun) return { pack, dryRun: true, bytes: built.indexHtml.length };

  const jobId = `_pm-${pack}`;
  const { videoPath } = await render({ jobId, jobDir, durationSec: PREVIEW_SEC });

  const outDir = path.join(PUBLIC_FRAMES, pack);
  fs.mkdirSync(outDir, { recursive: true });
  const previewPath = path.join(outDir, "preview.mp4");
  const posterPath = path.join(outDir, "poster.jpg");

  await encodePreview(videoPath, previewPath, portrait);
  const { t, luma } = await posterFrame(previewPath, FIXTURE.scenes);
  await encodePoster(previewPath, posterPath, t, portrait);

  // Housekeeping: the raw render is 5-10x the preview and serves no further purpose.
  try { fs.unlinkSync(videoPath); } catch { /* noop */ }
  try { fs.unlinkSync(videoPath.replace(/\.mp4$/, ".jpg")); } catch { /* the render's own thumb */ }
  fs.rmSync(jobDir, { recursive: true, force: true });

  return {
    pack, posterAt: t, posterLuma: luma,
    previewKb: Math.round(fs.statSync(previewPath).size / 1024),
    posterKb: Math.round(fs.statSync(posterPath).size / 1024),
  };
}

// ---- selection ---------------------------------------------------------------
function composerPathFor(pack) {
  const renderer = String((fm.getManifest(pack) || {}).renderer || "");
  if (!renderer) return null;
  try { return require.resolve(path.join(__dirname, "..", "src", "services", `${renderer.replace(/-/g, "_")}_composer`)); }
  catch { return null; }
}

function isStale(pack) {
  const poster = path.join(PUBLIC_FRAMES, pack, "poster.jpg");
  const preview = path.join(PUBLIC_FRAMES, pack, "preview.mp4");
  if (!fs.existsSync(poster) || !fs.existsSync(preview)) return true;
  const cp = composerPathFor(pack);
  if (!cp) return false;
  const cT = fs.statSync(cp).mtimeMs;
  return cT > fs.statSync(poster).mtimeMs || cT > fs.statSync(preview).mtimeMs;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const named = argv.reduce((acc, a, i) => (a === "--pack" && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) || 0 : 0;

  const all = frameRegistry.listPacks();
  let packs = named.length ? named : argv.includes("--stale") ? all.filter(isStale) : all;
  if (limit) packs = packs.slice(0, limit);

  console.log(`\nPACK MEDIA — ${packs.length} pack(s)${dryRun ? " (dry run)" : ""}\n`);
  fs.mkdirSync(WORK, { recursive: true });

  const results = [];
  for (const [i, pack] of packs.entries()) {
    const t0 = Date.now();
    process.stdout.write(`  [${i + 1}/${packs.length}] ${pack.padEnd(22)}`);
    try {
      const r = await buildPack(pack, { dryRun });
      results.push(r);
      if (r.skipped) console.log(`skipped — ${r.skipped}`);
      else if (r.dryRun) console.log(`built ${Math.round(r.bytes / 1024)}kb of html`);
      else console.log(`preview ${String(r.previewKb).padStart(4)}kb  poster ${String(r.posterKb).padStart(3)}kb  @${r.posterAt}s luma ${r.posterLuma}  ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e) {
      results.push({ pack, error: String(e.message).slice(0, 200) });
      console.log(`FAILED — ${String(e.message).slice(0, 160)}`);
    }
  }

  const failed = results.filter((r) => r.error);
  const dark = results.filter((r) => !r.error && !r.skipped && !r.dryRun && r.posterLuma <= 12);
  console.log(`\n${results.length - failed.length} ok, ${failed.length} failed`);
  // A poster this dark is technically a frame and practically an empty card.
  if (dark.length) console.log(`  ⚠ ${dark.length} poster(s) still very dark: ${dark.map((d) => `${d.pack}(${d.posterLuma})`).join(", ")}`);
  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
