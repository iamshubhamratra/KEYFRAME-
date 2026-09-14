// PROVE THE SEGMENTED LONG-FORM RENDER, without paying for a ten-minute film.
//
// Long bundled-template films are rendered as several compositions and joined,
// because the engine hard-rejects an OM_SCENES list over 50 entries (measured:
// 50 renders, 52 draws an error slate). This harness forces that split on a
// SHORT film via `segmentCap`, renders it for real, and checks the things that
// would actually break a viewer's film:
//
//   1. the joined file is the length the audio was mixed for
//   2. it is one continuous, playable video at the requested size
//   3. the template's opener/CTA appear ONCE, not once per part
//
//   node scripts/segment-render-harness.js [--cap 8] [--template HiveMind]
//                                          [--duration 45] [--scenes 18]

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const adapter = require("../src/services/omelette_adapter");
const { renderInSegments } = require("../src/services/pipeline");
const config = require("../src/config");

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const CAP = parseInt(arg("cap", "8"), 10);
const TEMPLATE = arg("template", "HiveMind");
const TOTAL = parseFloat(arg("duration", "45"));
const N = parseInt(arg("scenes", "18"), 10);

function probe(file, entries) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", entries, "-of", "default=nw=1:nk=1", file]);
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.on("error", () => resolve(null));
    p.on("exit", () => resolve(out.trim().split(/\r?\n/).filter(Boolean)));
  });
}

function makeFilm(n, total) {
  const raw = [];
  let sum = 0;
  for (let i = 0; i < n; i++) { const d = 3 + ((i * 7) % 9); raw.push(d); sum += d; }
  const k = total / sum;
  const durs = raw.map((d) => Math.round(d * k * 100) / 100);
  const scenes = [];
  let t = 0;
  durs.forEach((d, i) => {
    scenes.push({
      id: `s${i + 1}`, start: Math.round(t * 100) / 100, duration: d,
      kind: i === 0 ? "title" : i === durs.length - 1 ? "cta" : "point",
      headline: `Headline ${i + 1} for this beat`,
      subtext: `Supporting line ${i + 1} explaining the point in more detail.`,
      bullets: [`Point ${i + 1}A worth showing`, `Point ${i + 1}B worth showing`],
      voiceover: `Narration for scene ${i + 1}.`,
    });
    t = Math.round((t + d) * 100) / 100;
  });
  const durationSec = Math.round(t * 100) / 100;
  return { title: "Segment harness", brand: "Probe", durationSec, scenes };
}

(async () => {
  const storyboard = makeFilm(N, TOTAL);
  const dims = { width: 1280, height: 720, fps: 30 };
  const jobId = `segharness${Date.now().toString(36)}`;
  const jobDir = path.join(config.paths.jobsDir, jobId);
  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });

  // How many parts, and how many beats does that buy?
  const plan = adapter.planFilmSegments({ storyboard, template: TEMPLATE, cap: CAP });
  console.log(`template=${TEMPLATE} duration=${storyboard.durationSec}s scenes=${storyboard.scenes.length} cap=${CAP}`);
  console.log(`plan: ${plan.count} part(s) — ${plan.reason}`);
  if (plan.count < 2) { console.error("FAIL: harness did not force a split; lower --cap"); process.exit(1); }
  for (const [i, s] of plan.segments.entries()) {
    console.log(`  part ${i + 1}: ${s.durationSec}s, ${s.scenes.length} scenes, bookends intro=${s.bookends.intro} outro=${s.bookends.outro}`);
  }

  const R = { composer: adapter };
  const t0 = Date.now();
  const out = await renderInSegments({
    R, storyboard, dims, jobDir, framePack: TEMPLATE, template: TEMPLATE,
    captionCues: null, scriptCues: null, scriptOverlay: false,
    assets: [], jobId, durationSec: storyboard.durationSec,
    label: "harness", abortSignal: null, tracker: null,
    brandSkin: null, templatePlan: null, authoredScenes: null,
    segmentCap: CAP,
  });
  console.log(`\nrendered in ${Math.round((Date.now() - t0) / 1000)}s -> ${out && out.videoPath}`);

  let fails = 0;
  const check = (name, ok, detail) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
    if (!ok) fails++;
  };

  const file = out && out.videoPath;
  check("a joined file exists", !!(file && fs.existsSync(file)));
  if (file && fs.existsSync(file)) {
    const dur = await probe(file, "format=duration");
    const got = dur ? parseFloat(dur[0]) : NaN;
    check("joined length matches the audio's clock", Math.abs(got - storyboard.durationSec) <= 2.5,
      `${got.toFixed(2)}s vs ${storyboard.durationSec}s`);
    const streams = await probe(file, "stream=codec_type,width,height");
    check("one continuous video stream at the requested size",
      !!(streams && streams.includes("video") && streams.includes(String(dims.width)) && streams.includes(String(dims.height))),
      (streams || []).join(","));
    // Parts must be cleaned up — they are intermediates, not deliverables.
    const leftovers = fs.existsSync(path.join(jobDir, "renders"))
      ? fs.readdirSync(path.join(jobDir, "renders")).filter((f) => /^part-\d+\.mp4$|^parts\.txt$/.test(f))
      : [];
    check("intermediate parts cleaned up", leftovers.length === 0, leftovers.join(","));
  }

  // The film introduces itself once and signs off once, however many parts it
  // was built from. Count how many parts WOULD carry each bookend.
  const intros = plan.segments.filter((s) => s.bookends.intro).length;
  const outros = plan.segments.filter((s) => s.bookends.outro).length;
  check("exactly one part opens the film", intros === 1, `${intros} parts`);
  check("exactly one part closes the film", outros === 1, `${outros} parts`);

  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");

  // A harness film is not a deliverable — clear it out of the gallery and the
  // jobs dir so repeated runs don't silt them up. `--keep` leaves it for eyes.
  if (argv.includes("--keep")) {
    console.log(`kept: ${file}\njob dir: ${jobDir}`);
  } else {
    for (const f of [file, file && file.replace(/\.mp4$/, ".jpg")]) {
      if (f) { try { fs.rmSync(f, { force: true }); } catch { /* noop */ } }
    }
    try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch { /* noop */ }
    console.log("cleaned up (pass --keep to inspect the film)");
  }
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("harness error:", e); process.exit(1); });
