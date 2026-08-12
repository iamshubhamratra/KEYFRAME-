// FRAME DENSITY — finds slides that are mostly EMPTY.
//
// The recurring complaint is a scene that renders a header and then several
// hundred pixels of bare ground (a Trello film held a title band over ~75% empty
// cream for 4 seconds). Nothing catches it today: the structural gates check that
// a clip EXISTS and that media slots are FILLED, the contrast gate checks that
// text READS, and QA scores composition — none of them ask "is most of this frame
// nothing?". A scene can pass every gate and still be visually empty.
//
// This measures the RENDERED OUTPUT rather than the DOM. A DOM walk has to guess
// which elements actually paint (a full-bleed transparent wrapper looks like
// content, a background-image looks like nothing), and it only works for the
// composer paths we know. Pixels are the truth, and the same code then covers
// every renderer — template_engine, omelette, Three.js, all of them.
//
// ffmpeg downscales each sampled frame to a coarse grid and hands back raw RGB,
// so there is no PNG decoder and no image dependency: at 24x42 a 1080x1920 frame
// is ~3KB and every cell is already an average of its region, which is exactly
// the blur we want — one stray confetti petal must not mark a cell as "content".

const { spawn } = require("node:child_process");

// CALIBRATED against two frames whose truth was confirmed by eye — a full
// sketchnote title card (must not flag) and the reported Trello void (must
// flag). The first attempt used a 24-wide grid and reported 66 of 81 packs
// "sparse", because averaging a coarse cell washes thin text into the ground:
// type-on-paper — most of this fleet — measured as empty. Finer cells keep the
// text. The row test then has to LOOSEN, because at this resolution a few
// scattered confetti specks were enough to make the Trello void read as
// occupied. At these values the two frames separate 4% vs 81% dead.
const GRID_W = 128;                    // fine enough that text strokes survive the downscale
const CELL_INK = 18;                   // per-channel distance from ground before a cell counts as inked
const ROW_EMPTY = 0.08;                // a row with less than this share inked carries nothing real

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    const out = [], err = [];
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 || out.length
      ? resolve(Buffer.concat(out))
      : reject(new Error(`${cmd} exited ${code}: ${Buffer.concat(err).toString().slice(-200)}`))));
  });
}

/** Pull one frame at `t` as a GRID_W x gh grid of raw RGB triples. */
async function gridAt(mp4, t, gh, ffmpeg = "ffmpeg") {
  const buf = await run(ffmpeg, [
    "-v", "error", "-ss", String(t), "-i", mp4, "-frames:v", "1",
    "-vf", `scale=${GRID_W}:${gh}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
  ]);
  if (buf.length < GRID_W * gh * 3) return null;
  const cells = [];
  for (let i = 0; i < GRID_W * gh; i++) cells.push([buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]]);
  return cells;
}

/**
 * Measure one frame.
 *
 * The GROUND is the most common cell colour (quantised), not a corner sample — a
 * corner lands inside a header band or a full-bleed image often enough to invert
 * the whole reading.
 */
function measure(cells, gh) {
  const bucket = new Map();
  for (const c of cells) {
    const k = `${c[0] >> 4},${c[1] >> 4},${c[2] >> 4}`;
    bucket.set(k, (bucket.get(k) || 0) + 1);
  }
  let bestK = null, bestN = -1;
  for (const [k, n] of bucket) if (n > bestN) { bestN = n; bestK = k; }
  const ground = bestK.split(",").map((v) => (Number(v) << 4) + 8);

  const inked = cells.map((c) =>
    Math.abs(c[0] - ground[0]) > CELL_INK ||
    Math.abs(c[1] - ground[1]) > CELL_INK ||
    Math.abs(c[2] - ground[2]) > CELL_INK);

  const inkRatio = inked.filter(Boolean).length / inked.length;

  // Rows that carry nothing. A run of them is the dead band a viewer reads as
  // "the slide is empty" — far more telling than the overall ratio, because a
  // dense header plus a void can average out to a respectable number.
  const rowInked = [];
  for (let y = 0; y < gh; y++) {
    let n = 0;
    for (let x = 0; x < GRID_W; x++) if (inked[y * GRID_W + x]) n++;
    rowInked.push(n / GRID_W);
  }
  let run = 0, longest = 0, at = 0;
  rowInked.forEach((v, y) => {
    if (v < ROW_EMPTY) { run++; if (run > longest) { longest = run; at = y - run + 1; } }
    else run = 0;
  });

  return {
    inkRatio: Math.round(inkRatio * 1000) / 1000,
    deadBand: Math.round((longest / gh) * 1000) / 1000,
    deadFrom: Math.round((at / gh) * 100) / 100,
    deadTo: Math.round(((at + longest) / gh) * 100) / 100,
    ground: `#${ground.map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")}`,
  };
}

/**
 * Real duration, from the file. Sampling past the end returns the last frame or
 * nothing and reads as a totally empty slide — which is how a first run of the
 * fleet audit reported 66 of 81 packs "sparse" when the true cause was that the
 * previews are 7.2s and it sampled out to 30s. Never trust a passed-in duration.
 */
async function probeDuration(mp4, ffprobe = "ffprobe") {
  try {
    const out = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]);
    const d = parseFloat(String(out).trim());
    return isFinite(d) && d > 0 ? d : null;
  } catch { return null; }
}

/**
 * Scan a rendered film for empty slides.
 *
 * @param {string} mp4    path to the rendered video
 * @param {object} opts   { scenes:[{start,duration,id}], portrait, ffmpeg,
 *                          minInk, maxDeadBand }
 * @returns {Promise<{findings:Array, frames:Array}>} findings = the empty ones
 */
async function scanFilm(mp4, opts = {}) {
  const ffmpeg = opts.ffmpeg || "ffmpeg";
  const gh = opts.portrait === false ? Math.round(GRID_W * 9 / 16) : Math.round(GRID_W * 16 / 9);
  // Thresholds are deliberately forgiving: a deliberate minimal title card is a
  // real design, and flagging it would train everyone to ignore this gate.
  const minInk = opts.minInk != null ? opts.minInk : 0.04;
  const maxDead = opts.maxDeadBand != null ? opts.maxDeadBand : 0.45;

  // Sample each scene at 60% through it — past the entrance animation, before
  // the exit. Sampling the midpoint of a scene whose content arrives late reads
  // as empty when the finished frame is fine.
  // The FILE is the authority on length. A caller's durationSec is the film we
  // meant to make; the video is the film we made, and they diverge (VO re-timing,
  // a truncated render, a 7.2s preview of a 30s pack).
  const real = (await probeDuration(mp4, opts.ffprobe || "ffprobe")) || opts.durationSec || 30;
  const scenes = (Array.isArray(opts.scenes) && opts.scenes.length
    ? opts.scenes.map((s, i) => ({ id: s.id != null ? s.id : i + 1, t: Number(s.start) + Number(s.duration) * 0.6, dur: Number(s.duration) }))
    : Array.from({ length: Math.max(1, Math.floor(real / 3)) }, (_, i) => ({ id: i + 1, t: i * 3 + 1.8, dur: 3 })))
    // Stay clear of the tail. With real scene boundaries a small guard is enough,
    // but a blind scan has no idea where content ends: measured on the pack
    // previews (7.2s), EVERY flag landed at 4.8s — inside the fade-out — and 58
    // of 81 packs were reported sparse on nothing but their own end fade. Without
    // scene data, only the middle of the film is evidence.
    .filter((s) => (Array.isArray(opts.scenes) && opts.scenes.length
      ? s.t < real - 0.4
      : s.t > real * 0.1 && s.t < real * 0.7));
  if (!scenes.length) scenes.push({ id: 1, t: real * 0.5, dur: real });

  const frames = [], findings = [];
  for (const s of scenes) {
    let cells = null;
    try { cells = await gridAt(mp4, s.t, gh, ffmpeg); } catch { /* unreadable frame — skip, never fail the film */ }
    if (!cells) continue;
    let m = measure(cells, gh);
    // CONFIRM BEFORE ACCUSING. A sparse reading is far more often a slow ENTRANCE
    // than an empty scene: measured on blueprint-atelier, t=13.8s read 3% and the
    // same scene read 47% by 15.4s, because its cards stagger in over ~2s. That
    // one artifact was enough to make a healthy pack look systematically broken.
    // A scene that is genuinely empty is still empty a beat later; an entrance is
    // not. Only the SECOND look decides.
    if (m.inkRatio < minInk || m.deadBand > maxDead) {
      let later = null;
      const t2 = s.t + 1.6;
      if (t2 < real - 0.3) {
        try { later = await gridAt(mp4, t2, gh, ffmpeg); } catch { /* keep the first reading */ }
      }
      if (later) {
        const m2 = measure(later, gh);
        // Take the FULLER of the two — the scene at its best is what it is.
        if (m2.inkRatio > m.inkRatio) m = { ...m2, settledAt: Math.round(t2 * 100) / 100 };
      }
    }
    const rec = { sceneId: s.id, t: Math.round(s.t * 100) / 100, ...m };
    frames.push(rec);
    if (m.inkRatio < minInk) {
      findings.push({ ...rec, kind: "empty-frame", why: `only ${Math.round(m.inkRatio * 100)}% of the frame carries content (floor ${Math.round(minInk * 100)}%)` });
    } else if (m.deadBand > maxDead) {
      findings.push({ ...rec, kind: "dead-band", why: `${Math.round(m.deadBand * 100)}% of the frame height is empty (${Math.round(m.deadFrom * 100)}%-${Math.round(m.deadTo * 100)}% down)` });
    }
  }
  return { findings, frames };
}

module.exports = { scanFilm, measure, gridAt };
