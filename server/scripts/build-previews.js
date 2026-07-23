// Build hover-preview clips for the template gallery: a short, muted, looping
// preview.mp4 + a poster.jpg for every frame pack, written into
//   server/public/frames/<pack>/
// The gallery route (src/routes/frames.js -> mediaUrls) auto-exposes these as
// previewUrl / posterUrl, and the web PackCard (web/src/screens/Templates.jsx)
// fades the <video> in on hover. So generating these files is all it takes to
// light up hover previews across the whole gallery.
//
// It mirrors the production composer routing (see pipeline.js): a pack that
// declares a "renderer" in its manifest (flagship / brightlife / blueprint /
// bloom-fable / bauhaus-riot) renders through that dedicated composer so the
// preview shows the pack's real motion; every other pack renders through the
// deterministic scene-kit (+ the same vector/motion enrich floor the pipeline
// applies). Fully offline and deterministic — no LLM, no TTS, no network assets.
//
// Usage:
//   node scripts/build-previews.js                 # every pack
//   node scripts/build-previews.js --missing       # only packs with no preview.mp4
//   node scripts/build-previews.js sumi-kaze bloom-fable   # named packs
//
// Env knobs: PREVIEW_W/PREVIEW_H (render dims, default 1024x576),
//   PREVIEW_SCENE_SEC (per-scene seconds, default 2.4), PREVIEW_OUT_W (final
//   clip width, default 720), PREVIEW_QUALITY (hyperframes quality, default draft).

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const config = require("../src/config");
const frameRegistry = require("../src/services/frame_registry");
const frameManifest = require("../src/services/frame_manifest");
const sceneKit = require("../src/services/scene_kit");
const { enrichComposition } = require("../src/services/enrich");
const { render } = require("../src/services/renderer");

// Dedicated pack renderers — same map the pipeline uses. Keyed by the manifest
// "renderer" value; the pack's own composer draws its signature look.
const PACK_RENDERERS = {
  "three-flagship": require("../src/services/flagship_composer"),
  "three-brightlife": require("../src/services/brightlife_composer"),
  "blueprint": require("../src/services/blueprint_composer"),
  "bloom-fable": require("../src/services/bloom_composer"),
  "bauhaus-riot": require("../src/services/bauhaus_composer"),
  "genesis": require("../src/services/genesis_composer"),
};

const W = Number(process.env.PREVIEW_W) || 1280;
const H = Number(process.env.PREVIEW_H) || 720;
const FPS = 30;
const SCENE_SEC = Number(process.env.PREVIEW_SCENE_SEC) || 2.4;
const OUT_W = Number(process.env.PREVIEW_OUT_W) || 960;
const CRF = Number(process.env.PREVIEW_CRF) || 26;
const QUALITY = process.env.PREVIEW_QUALITY || "standard";

const PUBLIC_FRAMES = path.join(config.paths.root, "public", "frames");
const WORK = path.join(config.paths.root, "jobs", "_previews");

// BESPOKE 30s BRIEFS — the 2026-07-18 wave packs each get a full six-beat,
// pack-VOICED storyboard (hook → bullets → stat → quote → feature → cta) so the
// preview exercises the pack's whole grammar: every entrance/cut rotation, the
// stat & quote archetypes, and every kind-gated ornament in
// scene_kit_bespoke_ornaments.js (enso + bamboo, pendulum + escapement,
// clay ball + pellet pop, needle + heart + bow, jellyfish + sonar + angler).
// 6 scenes × 5s = 30s.
const BESPOKE_SCENE_SEC = 5;
const BESPOKE_PREVIEWS = {
  "sumi-kaze": [
    { kind: "hook",  purpose: "hook",    headline: "Every idea flows like ink.", emphasis: "ink", subtext: "One brushstroke is all it takes." },
    { kind: "text",  purpose: "how",     headline: "The scroll unrolls", emphasis: "scroll", onScreenText: ["Write — one honest sentence", "We grind the ink", "A film unrolls by itself"] },
    { kind: "stat",  purpose: "data",    headline: "Ten thousand frames", emphasis: "frames", onScreenText: ["12 agents on every film", "1080p full bloom", "0 hands required"] },
    { kind: "quote", purpose: "problem", headline: "Stillness, then motion", emphasis: "motion", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "The brush remembers", emphasis: "brush", subtext: "Every scene set in your brand's own ink." },
    { kind: "cta",   purpose: "cta",     headline: "Sumi Kaze", emphasis: "Paint your first film", subtext: "Made with KEYFRAME" },
  ],
  "orrery-brass": [
    { kind: "hook",  purpose: "hook",    headline: "Every launch has its hour.", emphasis: "hour", subtext: "Wind it with one sentence." },
    { kind: "text",  purpose: "how",     headline: "The wheels are turning", emphasis: "turning", onScreenText: ["Wind — one sentence in", "Mesh — agents take their orbits", "Strike — a film on the hour"] },
    { kind: "stat",  purpose: "data",    headline: "Precision, engineered", emphasis: "Precision", onScreenText: ["12 agents in mesh", "1080p brasswork", "0 missed beats"] },
    { kind: "quote", purpose: "problem", headline: "As the planets align", emphasis: "align", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Set your story in motion", emphasis: "motion", subtext: "Each scene ticks into place, on time." },
    { kind: "cta",   purpose: "cta",     headline: "Orrery Brass", emphasis: "Wind the mainspring", subtext: "Made with KEYFRAME" },
  ],
  claymotion: [
    { kind: "hook",  purpose: "hook",    headline: "Squish an idea. Ship a film.", emphasis: "film", subtext: "Rolled by hand, one sentence at a time." },
    { kind: "text",  purpose: "how",     headline: "Pinch, press, play", emphasis: "play", onScreenText: ["Pinch — one honest sentence", "Press — scenes take shape", "Play — 8fps of joy"] },
    { kind: "stat",  purpose: "data",    headline: "Handmade numbers", emphasis: "Handmade", onScreenText: ["8 fps of charm", "12 tiny hands", "1 sentence in"] },
    { kind: "quote", purpose: "problem", headline: "Play is serious work", emphasis: "Play", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Every frame has fingerprints", emphasis: "fingerprints", subtext: "Nothing here came off a shelf." },
    { kind: "cta",   purpose: "cta",     headline: "Claymotion", emphasis: "Get your hands dirty", subtext: "Made with KEYFRAME" },
  ],
  "folk-stitch": [
    { kind: "hook",  purpose: "hook",    headline: "Sewn with love, told in thread.", emphasis: "thread", subtext: "One sentence starts the sampler." },
    { kind: "text",  purpose: "how",     headline: "Thread by thread", emphasis: "Thread", onScreenText: ["Cut — one honest line", "Stitch — agents embroider scenes", "Tie — a film, knotted tight"] },
    { kind: "stat",  purpose: "data",    headline: "Counted stitches", emphasis: "Counted", onScreenText: ["12 agents at the loom", "1080p needlework", "0 dropped threads"] },
    { kind: "quote", purpose: "problem", headline: "Measure twice, tell once", emphasis: "once", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Patterns of your brand", emphasis: "Patterns", subtext: "Your colors, cross-stitched into every scene." },
    { kind: "cta",   purpose: "cta",     headline: "Folk Stitch", emphasis: "Thread your needle", subtext: "Made with KEYFRAME" },
  ],
  "abyssal-glow": [
    { kind: "hook",  purpose: "hook",    headline: "Light lives in the deep.", emphasis: "deep", subtext: "One sentence, and we dive." },
    { kind: "text",  purpose: "how",     headline: "Descend with us", emphasis: "Descend", onScreenText: ["Dive — one sentence down", "Glow — agents light every scene", "Surface — a film that shines"] },
    { kind: "stat",  purpose: "data",    headline: "Sounding the depths", emphasis: "depths", onScreenText: ["−4,000 m of calm", "12 agents aglow", "1080p bioluminescence"] },
    { kind: "quote", purpose: "problem", headline: "In darkness, we glow", emphasis: "glow", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Signals from below", emphasis: "Signals", subtext: "Sonar-true timing in every cut." },
    { kind: "cta",   purpose: "cta",     headline: "Abyssal Glow", emphasis: "Turn on your light", subtext: "Made with KEYFRAME" },
  ],
  kaleido: [
    { kind: "hook",  purpose: "hook",    headline: "Every idea refracts.", emphasis: "refracts", subtext: "One hue, endless symmetry." },
    { kind: "text",  purpose: "how",     headline: "It turns, it blooms", emphasis: "blooms", onScreenText: ["Write — one honest line", "Turn — the kaleidoscope blooms", "Reveal — a mesmerizing film"] },
    { kind: "stat",  purpose: "data",    headline: "Seen by millions", emphasis: "millions", onScreenText: ["2.4M mesmerized", "12 lenses", "0 two frames alike"] },
    { kind: "quote", purpose: "problem", headline: "Symmetry, in motion", emphasis: "motion", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Your color, refracted", emphasis: "color", subtext: "Pick a hue — the whole kaleidoscope re-tints." },
    { kind: "cta",   purpose: "cta",     headline: "Kaleido", emphasis: "Enter the light", subtext: "Made with KEYFRAME" },
  ],
  voltage: [
    { kind: "hook",  purpose: "hook",    headline: "Ideas hit like lightning.", emphasis: "lightning", subtext: "One sentence, full charge." },
    { kind: "text",  purpose: "how",     headline: "Charge it up", emphasis: "Charge", onScreenText: ["Write — one honest line", "Charge — agents light the coils", "Strike — a high-voltage film"] },
    { kind: "stat",  purpose: "data",    headline: "Rated ten times faster", emphasis: "ten", onScreenText: ["10x throughput", "99.9% uptime", "0 lag"] },
    { kind: "quote", purpose: "problem", headline: "Nothing slows it down", emphasis: "Nothing", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Your color is the current", emphasis: "current", subtext: "Pick a hue — every bolt and arc re-tints." },
    { kind: "cta",   purpose: "cta",     headline: "Voltage", emphasis: "Plug in now", subtext: "Made with KEYFRAME" },
  ],
  // Flagship: the full eight-beat living-world arc (world → chaos → order →
  // reveal → features → proof → growth → logo climax).
  genesis: [
    { kind: "hook",  purpose: "hook",      headline: "A world built for makers", subtext: "Watch your story come alive." },
    { kind: "text",  purpose: "problem",   headline: "Creation used to be chaos", subtext: "Scattered tools, broken flow." },
    { kind: "text",  purpose: "discovery", headline: "Now everything connects", subtext: "One world. Perfect order." },
    { kind: "feature", purpose: "reveal",  headline: "Meet Genesis", subtext: "Your studio, reimagined." },
    { kind: "feature", purpose: "features",headline: "Built to amaze", onScreenText: ["Cinematic in one click", "Fully brand-aware", "Renders in minutes"] },
    { kind: "stat",  purpose: "proof",     headline: "Loved by creators", onScreenText: ["24000 studios", "4.9 rating", "98% retention"] },
    { kind: "stat",  purpose: "growth",    headline: "Growth that compounds", subtext: "Every launch, bigger." },
    { kind: "cta",   purpose: "cta",       headline: "Genesis", subtext: "Create your world" },
  ],
};

// A universal 3-beat brief — hook / feature / sign-off. The copy is generic on
// purpose: a hover preview sells the pack's MOTION, type and color, not a story.
// The sign-off headline is the pack's own display name, set in the pack's type.
function storyboardFor(label, packName) {
  const bespoke = BESPOKE_PREVIEWS[packName];
  if (bespoke) {
    const scenes = bespoke.map((s, i) => ({ ...s, id: `s${i + 1}` }));
    let bt = 0;
    for (const s of scenes) { s.start = +bt.toFixed(2); s.duration = BESPOKE_SCENE_SEC; bt += BESPOKE_SCENE_SEC; }
    return { title: label, durationSec: +(BESPOKE_SCENE_SEC * scenes.length).toFixed(2), scenes };
  }
  const scenes = [
    { id: "s1", purpose: "hook",    kind: "hook", headline: "Every idea deserves a film.", emphasis: "film",
      subtext: "Say it in one sentence." },
    { id: "s2", purpose: "feature", kind: "text", headline: "One line in. A film out.", emphasis: "film",
      subtext: "Agents write, design and score every scene.",
      onScreenText: ["Write one honest line", "We art-direct the rest", "A finished film, done"] },
    { id: "s3", purpose: "cta",     kind: "cta",  headline: label, emphasis: label,
      subtext: "Made with KEYFRAME" },
  ];
  let t = 0;
  for (const s of scenes) { s.start = +t.toFixed(2); s.duration = SCENE_SEC; t += SCENE_SEC; }
  return { title: label, durationSec: +(SCENE_SEC * scenes.length).toFixed(2), scenes };
}

// Human display label for a pack (manifest name / FRAME.md `name:` / slug).
function labelFor(name) {
  const md = frameRegistry.getFrameMd(name) || "";
  const fm = (md.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || md;
  let label = (fm.match(/^name:\s*"?(.+?)"?\s*$/m) || [])[1] || "";
  label = label.replace(/\s*[—-]\s*Frame.*$/i, "").trim();
  if (label) return label;
  return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function rendererFor(name) {
  try { const m = frameManifest.getManifest(name); return (m && m.renderer) || null; }
  catch { return null; }
}

// Build index.html + meta.json for a pack into jobDir, routing to the right
// composer exactly like the pipeline does.
function buildComposition(name, jobDir) {
  const dims = { width: W, height: H, fps: FPS };
  const storyboard = storyboardFor(labelFor(name), name);
  const captionCues = []; // previews carry no baked subtitle cards
  const renderer = rendererFor(name);

  if (renderer && PACK_RENDERERS[renderer]) {
    const built = PACK_RENDERERS[renderer].buildComposition({ storyboard, dims, framePack: name, captionCues, assets: [] });
    return { storyboard, built, via: renderer };
  }

  // Default: deterministic scene-kit + the pipeline's vector/motion enrich floor.
  const built = sceneKit.buildComposition({ storyboard, dims, framePack: name, assets: [], captionCues, seedKey: `preview-${name}` });
  let indexHtml = built.indexHtml;
  try {
    const en = enrichComposition(indexHtml, {
      width: W, height: H, duration: storyboard.durationSec,
      packTokens: frameRegistry.getPackTokens(name),
    });
    if (en.changed) indexHtml = en.html;
  } catch { /* enrich is a bonus; the plain kit is already showcase-grade */ }
  return { storyboard, built: { indexHtml, metaJson: built.metaJson }, via: "scene-kit" };
}

function ff(args) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("error", () => resolve({ ok: false, err: "ffmpeg not found" }));
    p.on("exit", (code) => resolve({ ok: code === 0, err }));
  });
}

// Pick the brightest of several sampled frames for the poster, so a pack that
// opens on a dark scene never yields a black card. Mirrors renderer.js.
function ffLum(videoPath, t) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-v", "error", "-ss", t.toFixed(2), "-i", videoPath, "-frames:v", "1", "-vf", "scale=1:1,format=gray", "-f", "rawvideo", "-"], { windowsHide: true });
    const chunks = [];
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("error", () => resolve(0));
    p.on("exit", () => { const b = Buffer.concat(chunks); resolve(b.length ? b[0] : 0); });
  });
}

async function encodePreview(srcMp4, dur, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const previewOut = path.join(outDir, "preview.mp4");
  const posterOut = path.join(outDir, "poster.jpg");

  // Compact, muted, web-loopable H.264. Even dims for yuv420p; faststart for
  // instant hover playback.
  const enc = await ff([
    "-y", "-hide_banner", "-loglevel", "error", "-i", srcMp4,
    "-an", "-vf", `scale=${OUT_W}:-2:flags=lanczos`,
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-crf", String(CRF), "-preset", "veryfast", "-movflags", "+faststart",
    previewOut,
  ]);
  if (!enc.ok) throw new Error(`ffmpeg encode failed: ${enc.err.slice(-300)}`);

  // Brightest-frame poster.
  let bestT = dur * 0.45, bestLum = -1;
  for (const fr of [0.15, 0.3, 0.45, 0.6, 0.78, 0.9]) {
    const t = Math.max(0.1, dur * fr);
    const lum = await ffLum(srcMp4, t);
    if (lum > bestLum) { bestLum = lum; bestT = t; }
  }
  await ff(["-y", "-hide_banner", "-loglevel", "error", "-ss", bestT.toFixed(2), "-i", srcMp4, "-frames:v", "1", "-vf", `scale=${OUT_W}:-2`, "-q:v", "4", posterOut]);
  return { previewOut, posterOut };
}

async function buildPack(name) {
  const jobId = `preview-${name}-${W}x${H}`;
  const jobDir = path.join(WORK, name);
  try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch { /* stale handle from a prior run */ }
  fs.mkdirSync(jobDir, { recursive: true });

  const { storyboard, built, via } = buildComposition(name, jobDir);
  fs.writeFileSync(path.join(jobDir, "index.html"), built.indexHtml, "utf8");
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  console.log(`[previews] ${name}: composed via ${via} (${storyboard.scenes.length} scenes, ${storyboard.durationSec}s @ ${W}x${H})`);

  const visual = await render({ jobId, jobDir, durationSec: storyboard.durationSec, quality: QUALITY });
  const outDir = path.join(PUBLIC_FRAMES, name);
  const { previewOut } = await encodePreview(visual.videoPath, storyboard.durationSec, outDir);

  // Tidy: drop the full-res render + its stray thumbnail and the temp job dir.
  // Cleanup is best-effort — on Windows the just-finished render subprocess can
  // still hold a fleeting handle on the job dir (EPERM); the preview is already
  // saved, so a failed sweep must NOT fail the pack. Leftovers are reclaimed on
  // the next run's initial rm (also guarded).
  try { fs.unlinkSync(visual.videoPath); } catch { /* noop */ }
  try { fs.unlinkSync(visual.videoPath.replace(/\.mp4$/, ".jpg")); } catch { /* noop */ }
  try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch { /* windows handle lag */ }

  const kb = Math.round(fs.statSync(previewOut).size / 1024);
  console.log(`[previews] ${name}: ✓ preview.mp4 (${kb} KB) + poster.jpg -> public/frames/${name}/`);
}

function selectPacks(argv) {
  const all = frameRegistry.listPacks();
  const flags = argv.filter((a) => a.startsWith("--"));
  const named = argv.filter((a) => !a.startsWith("--"));
  if (named.length) return named.filter((n) => all.includes(n) || console.warn(`[previews] unknown pack: ${n}`) || false);
  if (flags.includes("--missing")) {
    return all.filter((n) => !fs.existsSync(path.join(PUBLIC_FRAMES, n, "preview.mp4")));
  }
  return all;
}

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const packs = selectPacks(process.argv.slice(2));
  console.log(`[previews] building ${packs.length} pack preview(s): ${packs.join(", ")}`);
  const failed = [];
  for (const name of packs) {
    try { await buildPack(name); }
    catch (e) { console.error(`[previews] ${name}: ✗ ${String(e.message).slice(0, 400)}`); failed.push(name); }
  }
  console.log(`\n[previews] done. ok=${packs.length - failed.length} failed=${failed.length}${failed.length ? " -> " + failed.join(", ") : ""}`);
  if (failed.length) process.exitCode = 1;
}

main();
