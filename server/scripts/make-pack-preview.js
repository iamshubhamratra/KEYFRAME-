// PACK PREVIEW BUILDER — renders the gallery thumbnail + hover loop for a frame pack.
//
//   server/public/frames/<pack>/preview.mp4   the motion teaser the card fades in on hover
//   server/public/frames/<pack>/poster.jpg    the static thumbnail the card shows by default
//
// Both are served by routes/frames.js (mediaUrls) and consumed by web PackCard. A pack with
// neither falls back to the synthetic lore gradient, which shows the pack's colours but not
// its actual design — which is why every installed pack should have a real pair.
//
// Usage:
//   node scripts/make-pack-preview.js missing              # only packs with no preview yet
//   node scripts/make-pack-preview.js all --force          # re-render every pack
//   node scripts/make-pack-preview.js organic-garden prisma-bloc
//   node scripts/make-pack-preview.js missing --quality draft --concurrency 2
//
// It composes through the REAL dispatch (pipeline.attemptLlmComposition with remix:false), so
// a pack is previewed by the exact composer that will render the customer's film — native
// pack, three-*, or the scene-kit default. No LLM call is made on that path, so this is
// deterministic and free; it costs one Chromium render per pack.
//
// Output geometry matches the packs generated before it (do not drift — the gallery mixes
// old and new cards side by side):
//   portrait   render 648x1152 -> preview 540x960   poster 648x1152
//   horizontal render 1280x720 -> preview 1280x720  poster 1280x720
//   square     render 1080x1080 -> preview 720x720  poster 1080x1080

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const config = require("../src/config");
const frameRegistry = require("../src/services/frame_registry");
const frameManifest = require("../src/services/frame_manifest");
const { attemptLlmComposition } = require("../src/services/pipeline");
const { UsageTracker } = require("../src/services/usage");

const PUBLIC_FRAMES = path.join(config.paths.root, "public", "frames");
const WORK_ROOT = path.join(config.paths.jobsDir, "_preview");

// Preview length. 6.0s is the established loop duration for the packs already in the
// gallery; the demo film below is authored to exactly fill it, so the whole render IS the
// preview (no windowing, no wasted frames).
const PREVIEW_SEC = 6.0;
const FPS = 30;

const GEOMETRY = {
  portrait:   { render: [648, 1152], preview: [540, 960],  poster: [648, 1152] },
  horizontal: { render: [1280, 720], preview: [1280, 720], poster: [1280, 720] },
  square:     { render: [1080, 1080], preview: [720, 720], poster: [1080, 1080] },
};

// The demo film. Three beats that exercise what a pack card needs to show: its type
// treatment (hook), its list/stat layout (feature), and its close (cta). The copy is held
// deliberately stable — "Every frame counts" is the headline on every poster already in
// the gallery, so a newly generated card reads as part of the same set.
const DEMO_SCENES = [
  {
    id: "s1", start: 0, duration: 2.2, purpose: "hook", kind: "hook", animation: "spring",
    headline: "Every frame counts", emphasis: "counts",
    subtext: "A complete design system, art-directed end to end.",
    onScreenText: ["Every frame counts"],
    voiceover: "Every frame counts.",
    visualDirection: "Bold title card in the pack's own voice.",
    beats: [],
  },
  {
    id: "s2", start: 2.2, duration: 2.1, purpose: "feature", kind: "stat", animation: "drift",
    headline: "Colour, type, motion",
    subtext: "Sacred atoms. Free composition.",
    onScreenText: ["Bold", "Kinetic", "Yours"],
    voiceover: "Colour, type and motion — all sacred.",
    visualDirection: "Three supporting cards or stats land in sequence.",
    beats: [],
  },
  {
    id: "s3", start: 4.3, duration: 1.7, purpose: "cta", kind: "cta", animation: "char-pop",
    headline: "Use this style", emphasis: "Use this style",
    subtext: "Pick the look — we direct the film.",
    onScreenText: ["Use this style"],
    voiceover: "Pick the look.",
    visualDirection: "Closing lockup.",
    beats: [],
  },
];

function demoStoryboard(pack) {
  const scenes = DEMO_SCENES.map((s) => ({ ...s }));
  const m = frameManifest.getManifest(pack);
  const colors = m ? Object.values(m.colors || {}) : [];
  return {
    title: "Every frame counts",
    durationSec: PREVIEW_SEC,
    orientation: orientationOf(pack),
    // The pack's own authored colours — never a brand skin. A gallery preview must show
    // the pack as designed, not as re-skinned for one customer's palette.
    palette: {
      background: (m && m.surface && m.surface.ground) || colors[0] || "#0B0B12",
      text: "#FFFFFF",
      primary: colors[1] || colors[0] || "#6366F1",
      accent: colors[2] || colors[1] || "#8B5CF6",
    },
    scenes,
    source: "pack-preview",
  };
}

function orientationOf(pack) {
  const m = frameManifest.getManifest(pack);
  const o = String((m && m.orientation) || "horizontal").toLowerCase();
  if (o === "portrait" || o === "vertical") return "portrait";
  if (o === "square") return "square";
  return "horizontal";
}

function hasPreview(pack) {
  return fs.existsSync(path.join(PUBLIC_FRAMES, pack, "preview.mp4"))
    && fs.existsSync(path.join(PUBLIC_FRAMES, pack, "poster.jpg"));
}

// ---------------------------------------------------------------- ffmpeg helpers
function ff(args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    const out = [];
    let err = "";
    if (capture) p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("error", reject);
    p.on("exit", (code) => code === 0
      ? resolve(capture ? Buffer.concat(out) : null)
      : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`)));
  });
}

// Average luminance of one frame, as a single byte. A pure-black or blown-white frame is a
// transition, not a thumbnail — this rejects those outright.
async function luminanceAt(videoPath, t) {
  const buf = await ff([
    "-v", "error", "-ss", t.toFixed(2), "-i", videoPath,
    "-frames:v", "1", "-vf", "scale=1:1,format=gray", "-f", "rawvideo", "-",
  ], { capture: true }).catch(() => null);
  return buf && buf.length ? buf[0] : -1;
}

// How much is actually DRAWN in a frame, as the compressed size of a small JPEG of it.
// Brightness was the wrong measure: it ranks a light pack's empty cream plate above the
// same pack's fully-composed scene, which is exactly how the first organic-garden poster
// came out as a headline over two-thirds of nothing. Detail survives the tone of the pack.
async function detailAt(videoPath, t, scratchDir) {
  const probe = path.join(scratchDir, `probe_${t.toFixed(2).replace(".", "_")}.jpg`);
  try {
    await ff([
      "-v", "error", "-y", "-ss", t.toFixed(2), "-i", videoPath, "-frames:v", "1",
      "-vf", "scale=320:-2", "-q:v", "5", probe,
    ]);
    return fs.statSync(probe).size;
  } catch { return -1; }
  finally { try { fs.rmSync(probe, { force: true }); } catch { /* noop */ } }
}

// The poster timestamp.
//
// It is pinned to the HOOK scene, not chosen freely across the film. Scored across all
// three beats, every om-family pack picked its CTA — those packs build their world up over
// the runtime, so the last beat is always the most detailed frame. It is also the worst
// thumbnail: a wall of "USE THIS STYLE / yourproduct.com", which is the card's own button
// label rather than the pack's design, and it does not match the "Every frame counts"
// headline on the thirteen posters already in the gallery. A gallery of mixed old and new
// cards has to read as one set.
//
// Within the hook, candidates sit late in the window (entrance landed, before the hand-off)
// and the most-drawn one wins. Later beats are kept only as a fallback for a pack whose
// hook is a dark fade — better a CTA poster than a black one.
function posterCandidates() {
  const hook = DEMO_SCENES[0];
  const within = [0.65, 0.8, 0.92].map((f) => hook.start + hook.duration * f);
  const fallback = DEMO_SCENES.slice(1).map((s) => Math.max(0.3, s.start + s.duration - 0.3));
  return { within, fallback };
}

async function bestOf(videoPath, times, scratchDir) {
  let best = null;
  let bestScore = -1;
  for (const t of times) {
    const lum = await luminanceAt(videoPath, t);
    if (lum < 8 || lum > 250) continue;         // black / blown-out transition frame
    const score = await detailAt(videoPath, t, scratchDir);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

async function pickPosterTime(videoPath, scratchDir) {
  const { within, fallback } = posterCandidates();
  const inHook = await bestOf(videoPath, within, scratchDir);
  if (inHook != null) return inHook;
  const late = await bestOf(videoPath, fallback, scratchDir);
  if (late != null) {
    console.warn(`[preview] hook frames were black/blown — poster taken from a later beat`);
    return late;
  }
  return within[within.length - 1];
}

async function writePreview(srcMp4, destMp4, [w, h]) {
  await ff([
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", srcMp4,
    "-t", String(PREVIEW_SEC),
    "-an",                                    // hover previews are muted; drop the track
    "-vf", `scale=${w}:${h}:flags=lanczos`,
    "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p",
    "-crf", "30", "-preset", "slow",
    "-movflags", "+faststart",                // starts playing before the whole file lands
    destMp4,
  ]);
}

async function writePoster(srcMp4, destJpg, [w, h], atSec) {
  await ff([
    "-y", "-hide_banner", "-loglevel", "error",
    "-ss", atSec.toFixed(2), "-i", srcMp4, "-frames:v", "1",
    "-vf", `scale=${w}:${h}:flags=lanczos`,
    "-q:v", "4", destJpg,
  ]);
}

// ---------------------------------------------------------------- one pack
// PLACEHOLDER MEDIA, NOT STOCK. A gallery card exists to show a pack's DESIGN, and for many
// packs the design IS how they hold a picture — a terminal window, a cabin porthole, a roadside
// billboard, a leaf-cut card. Rendered with no assets at all, every pack that opens on a
// picture obeys the kit's first law (never draw an empty container) and falls back to the
// shared `statement` layout, so sixteen distinct packs produced sixteen near-identical
// thumbnails. These are the harness's own deterministic placeholders — drawn page furniture in
// neutral tones, no stock photography and no claim about anyone's product — so each card shows
// the pack actually holding media. `sceneIds` are left unset: the preview film's three beats
// are generic, so the CD-hint bonus has nothing to point at and ranking alone should place them.
const { stageAssets } = require("./lib/placeholder_assets");

async function buildPreview(pack, { quality }) {
  const orientation = orientationOf(pack);
  const geo = GEOMETRY[orientation];
  const [rw, rh] = geo.render;
  const jobId = `_preview_${pack}`;
  const jobDir = path.join(WORK_ROOT, pack);

  fs.rmSync(jobDir, { recursive: true, force: true });
  fs.mkdirSync(jobDir, { recursive: true });

  const storyboard = demoStoryboard(pack);
  const captionCues = [];            // a gallery preview shows the design, not subtitles
  const tracker = new UsageTracker();

  // renderer.render() defaults its quality from config, and the composers call it without
  // one — so the only way to steer a preview render is the config value itself. Set it for
  // the batch (this process renders nothing else).
  config.server.renderQuality = quality;

  const t0 = Date.now();
  const visual = await attemptLlmComposition({
    storyboard,
    dims: { width: rw, height: rh, fps: FPS },
    jobDir,
    // debug:false — no numbered bands, no corner markers. Those exist so the dev harnesses can
    // SEE a crop bug; in a gallery thumbnail they read as broken output rather than as design.
    assets: stageAssets(jobDir, { debug: false }),
    tracker,
    jobId,
    durationSec: PREVIEW_SEC,
    label: `preview:${pack}`,
    framePack: pack,
    captionCues,
    remix: false,                    // deterministic dispatch; never the LLM composer
  });

  const srcMp4 = visual.videoPath;
  if (!srcMp4 || !fs.existsSync(srcMp4)) throw new Error("render produced no mp4");

  const outDir = path.join(PUBLIC_FRAMES, pack);
  fs.mkdirSync(outDir, { recursive: true });
  const destMp4 = path.join(outDir, "preview.mp4");
  const destJpg = path.join(outDir, "poster.jpg");

  await writePreview(srcMp4, destMp4, geo.preview);
  const posterAt = await pickPosterTime(srcMp4, jobDir);
  await writePoster(srcMp4, destJpg, geo.poster, posterAt);

  // The intermediate render is scratch: it lands in public/videos (render() moves it there)
  // and would otherwise be served as if it were a customer's film.
  for (const f of [srcMp4, srcMp4.replace(/\.mp4$/, ".jpg")]) {
    try { fs.rmSync(f, { force: true }); } catch { /* scratch cleanup is best effort */ }
  }
  try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch { /* noop */ }

  const kb = (p) => Math.round(fs.statSync(p).size / 1024);
  console.log(
    `[preview] ${pack.padEnd(22)} ${orientation.padEnd(10)} ` +
    `preview ${geo.preview.join("x")} ${String(kb(destMp4)).padStart(4)}KB · ` +
    `poster ${geo.poster.join("x")} ${String(kb(destJpg)).padStart(4)}KB @${posterAt.toFixed(1)}s · ` +
    `${Math.round((Date.now() - t0) / 1000)}s`
  );
}

// ---------------------------------------------------------------- runner
async function main() {
  // Flags taking a value must be named, or a boolean flag would swallow the pack that
  // follows it (`--force organic-garden` losing the pack).
  const VALUE_FLAGS = new Set(["quality"]);
  const argv = process.argv.slice(2);
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { positional.push(a); continue; }
    const name = a.slice(2);
    if (VALUE_FLAGS.has(name)) { opts[name] = argv[++i]; continue; }
    opts[name] = true;
  }

  const quality = opts.quality || config.server.renderQuality || "high";
  const force = opts.force === true;
  const installed = frameRegistry.listPacks();

  const target = positional[0] || "missing";
  let packs;
  if (target === "missing") packs = installed.filter((p) => !hasPreview(p));
  else if (target === "all") packs = installed;
  else {
    packs = positional;
    const unknown = packs.filter((p) => !installed.includes(p));
    if (unknown.length) {
      console.error(`unknown pack(s): ${unknown.join(", ")}\ninstalled: ${installed.join(", ")}`);
      process.exit(1);
    }
  }
  // An explicit list or "all" still skips packs that already have a pair unless --force,
  // so re-running the command is cheap and idempotent.
  if (!force) packs = packs.filter((p) => !hasPreview(p));

  if (!packs.length) {
    console.log("[preview] nothing to do — every requested pack already has preview.mp4 + poster.jpg (use --force to re-render)");
    return;
  }

  console.log(`[preview] ${packs.length} pack(s) · quality=${quality} · ${PREVIEW_SEC}s @${FPS}fps`);
  fs.mkdirSync(WORK_ROOT, { recursive: true });

  const failed = [];
  for (const pack of packs) {
    try {
      await buildPreview(pack, { quality });
    } catch (e) {
      // One bad pack must not cost the whole batch — record it and keep going, so a
      // 9-pack run still delivers the 8 that work.
      failed.push([pack, String(e.message).slice(0, 200)]);
      console.error(`[preview] ${pack} FAILED: ${String(e.message).slice(0, 300)}`);
    }
  }

  console.log(`[preview] done — ${packs.length - failed.length}/${packs.length} built`);
  if (failed.length) {
    for (const [p, m] of failed) console.error(`  ${p}: ${m}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error("[preview] fatal:", e); process.exit(1); });
