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
const crypto = require("node:crypto");

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

// The asset DESCRIPTORS (what the composer sees) are separate from writing the files, because the
// guard needs the descriptors to reproduce a hash and must not write anything.
function assetDescriptors() {
  const out = ASSET_SHAPES.map((a) => ({
    path: a.path, type: "image", width: a.w, height: a.h, ratio: a.ratio,
    source: "website", kindHint: a.kindHint, cdProminence: a.cdProminence, cdScore: a.cdScore,
    visionOk: true, alt: "product interface",
  }));
  out.push({ path: "pm-logo.svg", type: "image", width: 400, height: 400, ratio: 1, source: "website-brand", role: "logo", alt: "logo" });
  return out;
}

function writeAssets(dir) {
  for (const a of ASSET_SHAPES) fs.writeFileSync(path.join(dir, a.path), uiPlaceholder(a.w, a.h), "utf8");
  // A mark for the packs whose closing beat takes a logo. A ring and an N, in the same neutral grey.
  fs.writeFileSync(path.join(dir, "pm-logo.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><circle cx="200" cy="200" r="150" fill="none" stroke="#5B616E" stroke-width="26"/><path d="M150 268V132l100 136V132" fill="none" stroke="#5B616E" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/></svg>`, "utf8");
  return assetDescriptors();
}

// ---- composition identity ----------------------------------------------------
// The generator records WHICH COMPOSITION it rendered, and the guard recomputes it. Both use this one
// function so they cannot drift: it is byte-identical to scripts/golden-composers.js's hash, whose
// separator is a NUL. Written as String.fromCharCode(0) because this value passes through several
// layers of quoting and a one-byte difference would fail every pack for no reason.
const NUL = String.fromCharCode(0);
function compositionHash(built) {
  return crypto.createHash("sha256").update(built.indexHtml + NUL + (built.metaJson || "")).digest("hex").slice(0, 16);
}

// Build a pack's composition WITHOUT touching the disk — the guard needs the hash, not the files.
// It must mirror buildPack()'s call exactly (same fixture, same asset descriptors, same seedKey) or
// the hash it computes will not be the hash that was recorded.
function buildForHash(pack) {
  const manifest = fm.getManifest(pack) || {};
  const comp = composerModuleFor(manifest.renderer);
  if (!comp) return null;
  const portrait = /portrait/i.test(String(manifest.orientation || ""));
  const dims = portrait ? { width: 1080, height: 1920, fps: 30 } : { width: 1920, height: 1080, fps: 30 };
  return comp.buildComposition({
    storyboard: JSON.parse(JSON.stringify(FIXTURE)),
    dims, framePack: pack, assets: assetDescriptors(), captionCues: [], brandSkin: null,
    seedKey: `packmedia-${pack}`,
  });
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
// Below this the frame is nearly uniform — a bare page, or one filled by a flat placeholder slab.
const DETAIL_FLOOR = 14;

// Luma alone cannot tell a good card from a half-empty one. Sampled at the opening beat, paper-tales
// produced an open storybook with the headline on the right page and the LEFT PAGE BLANK: bright,
// well over the floor, and half of it nothing. So each candidate is also measured for DETAIL — the
// spread of an 8x8 luma grid. A frame with type and furniture across it varies; a frame with a large
// empty page, or one filled by a flat grey placeholder, does not. Among candidates that clear the
// darkness floor the most detailed wins, which rejects both failure modes with one number.
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

// THE CARD MUST SIT ON THE PACK'S OWN SURFACE. This is what the critics actually judged by:
// biennale-yellow was marked off-brief because its card was "a dark indigo field" when the manifest's
// lead surface is warm parchment — indigo is that pack's INK. Beat order cannot express this, because
// which beat inverts the ground differs per pack: biennale inverts on its closing lockup, kinetic-bold
// inverts on every other beat by design. The manifest already states the answer, so read it.
function groundOf(pack) {
  const m = fm.getManifest(pack) || {};
  const hex = (m.surface && m.surface.ground) || (m.colors && (m.colors.ground || m.colors.paper || m.colors.bg));
  if (typeof hex !== "string") return null;
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const groundDistance = (rgb, ground) => (!rgb || !ground ? Infinity
  : Math.sqrt((rgb[0] - ground[0]) ** 2 + (rgb[1] - ground[1]) ** 2 + (rgb[2] - ground[2]) ** 2));
// A frame this far from the declared surface is showing a different ground than the pack advertises.
const GROUND_TOLERANCE = 105;
async function posterFrame(video, scenes, pack) {
  const first = scenes[0], last = scenes[scenes.length - 1];
  // WHAT A CARD SHOULD SHOW, learned by having six critics grade all 46 of them against their briefs.
  // Three findings drove this order:
  //
  // 1. PREFER A TYPE-LED BEAT. Eight cards were judged "the grey placeholder is the loudest thing on
  //    the card" — on a dark pack a flat light mock is the brightest object in the frame, so the card
  //    sold a wireframe instead of the pack. The fixture's figures, quote and closing beats carry no
  //    picture, so they show the pack's own type and furniture. The preview still shows the picture
  //    beats; the CARD does not have to.
  // 2. STAY INSIDE THE BEAT. Sampling at 0.94 put three cards mid-cut — two headlines at once, a
  //    half-wiped panel, type sliced by a transition edge. 0.55-0.7 is clear of both edges.
  // 3. FIRST ACCEPTABLE, NOT MOST DETAILED. Taking the global maximum detail moved biennale-yellow off
  //    its parchment opening onto a dark indigo frame — atypical of the pack and against its brief. So
  //    preference order decides, and detail is only a floor that rejects a near-empty frame.
  const mid = scenes.slice(1, -1);
  const candidates = [
    ...mid.slice(1).map((sc) => sc.start + sc.duration * 0.66),  // figures / quote: type-led, no picture
    last.start + last.duration * 0.62,                            // the closing lockup
    first.start + first.duration * 0.8,                            // the opening, most of it landed
    ...mid.slice(0, 1).map((sc) => sc.start + sc.duration * 0.66), // the picture beat, last resort
  ].map((t) => +t.toFixed(2));

  const ground = groundOf(pack);
  const scored = [];
  for (const t of candidates) {
    const s = { t, ...(await sampleAt(video, t)) };
    s.groundGap = Math.round(groundDistance(s.rgb, ground));
    scored.push(s);
  }

  // FIRST candidate that is neither too dark nor too flat. Preference order decides; the two floors
  // only reject a frame that would make a bad card. Maximising detail instead moved packs onto
  // atypical frames (see the note above).
  // First candidate that is on the pack's own surface AND neither too dark nor too flat.
  const onBrief = scored.find((s) => s.luma >= POSTER_FLOOR && s.detail >= DETAIL_FLOOR && s.groundGap <= GROUND_TOLERANCE);
  if (onBrief) return { t: onBrief.t, luma: onBrief.luma, detail: onBrief.detail, groundGap: onBrief.groundGap };

  // No frame is inside the tolerance: take the CLOSEST to the declared surface among the frames that
  // clear the floors — not the first one in preference order. Taking the first left biennale-yellow on
  // its dark closing lockup (gap 265) when its parchment opening sat further down the same list.
  // The detail floor is dropped here on purpose. It was excluding the very frames that ARE on the
  // pack's surface: early in a beat little type has landed, so an on-brief parchment frame scores low
  // on detail and never reached the ground comparison. Being on the right surface matters more to a
  // card than being busy, so luma is the only floor at this stage and detail breaks ties.
  const usable = scored.filter((s) => s.luma >= POSTER_FLOOR);
  if (usable.length) {
    const closest = usable.reduce((a, b) => (b.groundGap < a.groundGap || (b.groundGap === a.groundGap && b.detail > a.detail) ? b : a));
    return { t: closest.t, luma: closest.luma, detail: closest.detail, groundGap: closest.groundGap };
  }

  // Nothing clears both floors: take the best-lit frame that at least has some detail, then any lit one.
  const lit = scored.filter((s) => s.luma >= POSTER_FLOOR);
  if (lit.length) {
    const pick = lit.reduce((a, b) => (b.detail > a.detail ? b : a));
    return { t: pick.t, luma: pick.luma, detail: pick.detail };
  }
  // Nothing clears the floor — a genuinely dark pack. Take the least dark rather than the most detailed;
  // on a near-black frame "detail" is mostly noise.
  const fallback = scored.reduce((a, b) => (b.luma > a.luma ? b : a));
  return { t: fallback.t, luma: fallback.luma, detail: fallback.detail };
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

  // STAMP THE MEDIA WITH THE COMPOSITION IT CAME FROM. The guard needs to know whether the pack's
  // OUTPUT changed, not whether its file was touched: keying staleness on mtime fails the build for a
  // comment edit and costs a 2-minute re-render to clear, and a guard that nags on no-ops is a guard
  // that gets exempted. This is the same hash scripts/golden-composers.js uses, so "the render
  // changed" means exactly what it means there.
  fs.writeFileSync(path.join(outDir, "media.json"), `${JSON.stringify({
    pack,
    composition: compositionHash(built),
    fixture: FIXTURE.title,
    previewSec: PREVIEW_SEC,
    posterAt: t,
    generatedAt: new Date().toISOString(),
  }, null, 2)}
`, "utf8");

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

// Write media.json for media that was ALREADY rendered from the current composition, without
// re-rendering it. Needed because a sweep already in flight loaded this module before stamping
// existed, and re-rendering thirty packs to add a six-line JSON file would be absurd. Only valid when
// the files on disk really did come from today's composer — the caller asserts that; nothing here can
// verify it after the fact.
function stampOnly(packs) {
  let done = 0;
  for (const pack of packs) {
    const dir = path.join(PUBLIC_FRAMES, pack);
    if (!fs.existsSync(path.join(dir, "poster.jpg")) || !fs.existsSync(path.join(dir, "preview.mp4"))) continue;
    let built = null;
    try { built = buildForHash(pack); } catch { built = null; }
    if (!built) continue;
    fs.writeFileSync(path.join(dir, "media.json"), `${JSON.stringify({
      pack, composition: compositionHash(built), fixture: FIXTURE.title, previewSec: PREVIEW_SEC,
      stampedAt: new Date().toISOString(), note: "stamped for media rendered from this composition",
    }, null, 2)}\n`, "utf8");
    done++;
  }
  return done;
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

  // --poster-only: re-pick and re-cut the poster from the preview ALREADY on disk. The poster is a
  // frame of the preview, so improving the frame-choice rule does not need another render — that would
  // be two minutes a pack to change which second of an existing clip gets saved as a JPEG.
  if (argv.includes("--poster-only")) {
    let done = 0, dark = [];
    for (const pack of packs) {
      const dir = path.join(PUBLIC_FRAMES, pack);
      const preview = path.join(dir, "preview.mp4");
      if (!fs.existsSync(preview)) continue;
      const portrait = /portrait/i.test(String((fm.getManifest(pack) || {}).orientation || ""));
      try {
        const { t, luma, detail, groundGap } = await posterFrame(preview, FIXTURE.scenes, pack);
        await encodePoster(preview, path.join(dir, "poster.jpg"), t, portrait);
        if (luma <= 12) dark.push(`${pack}(${luma})`);
        done++;
        console.log(`  ${pack.padEnd(22)} poster @${t}s luma ${luma} detail ${detail} groundGap ${groundGap}`);
      } catch (e) {
        console.log(`  ${pack.padEnd(22)} FAILED — ${String(e.message).slice(0, 120)}`);
      }
    }
    console.log(`\nre-cut ${done}/${packs.length} poster(s) from existing previews`);
    if (dark.length) console.log(`  ⚠ still very dark: ${dark.join(", ")}`);
    process.exit(0);
  }

  if (argv.includes("--stamp-only")) {
    const n = stampOnly(packs);
    console.log(`\nPACK MEDIA — stamped ${n}/${packs.length} pack(s) with their composition hash\n`);
    process.exit(0);
  }

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

module.exports = { FIXTURE, buildForHash, compositionHash, PREVIEW_SEC };

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
