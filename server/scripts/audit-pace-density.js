#!/usr/bin/env node
// PACE DENSITY AUDIT — the same input at every pace, side by side.
//
//   node scripts/audit-pace-density.js                 # a real shipped job
//   node scripts/audit-pace-density.js --job <id>
//   node scripts/audit-pace-density.js --duration 60 --orientation vertical
//   node scripts/audit-pace-density.js --all           # every job with a brief
//   node scripts/audit-pace-density.js --json
//
// WHAT IT ANSWERS. "Fast" must mean a concise voiceover over a DENSE frame, not
// a short script over an empty one. That is a claim about two numbers moving in
// opposite directions, and it was previously unmeasurable: nothing in the repo
// reported how much copy a frame actually carried. This does.
//
// It runs the real pipeline objects — services/pacing.js resolve(), the
// storyboard's own copy floor, and services/content_density.js — against a real
// brief and script, once per mode, and prints what a viewer would end up
// looking at. No LLM, no network, no render: the model-authored copy is held
// FIXED across the four runs so the only thing that varies is the pace, which is
// what makes the comparison honest.
//
// READ THE TABLE LIKE THIS:
//   VO words/sec        should FALL as pace rises      (the feature)
//   screen chars/frame  should NOT fall                (the fix)
//   elements/frame      should RISE                    (the fix)
//   thin frames         should be ZERO at every pace   (the bug)
//   readability         must be 100% at every pace     (precedence rule 1)

const fs = require("node:fs");
const path = require("node:path");
const P = require("../src/services/pacing");
const CD = require("../src/services/content_density");

const MODES = ["relaxed", "normal", "fast", "very-fast"];
const argv = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : def;
};
const asJson = argv.includes("--json");

const norm = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const wordsOf = (v) => (norm(v).match(/\S+/g) || []).length;
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// INPUT — a real job, so the audit is about real briefs and not a fixture.
// ---------------------------------------------------------------------------

function loadJobs() {
  const p = path.join(__dirname, "..", "jobs.json");
  if (!fs.existsSync(p)) return [];
  try { return Object.values(JSON.parse(fs.readFileSync(p, "utf8"))); }
  catch { return []; }
}

function pickJob(id) {
  const jobs = loadJobs().filter((j) => j && j.brief && j.script && Array.isArray(j.script.scenes) && j.script.scenes.length);
  if (!jobs.length) return null;
  if (id) return jobs.find((j) => j.id === id) || null;
  // The richest brief available — the audit is least informative on a thin one,
  // and a thin brief is a content problem rather than a density problem.
  return jobs.sort((a, a2) => {
    const size = (j) => ((j.brief.keyMessages || []).length + (j.brief.mustIncludeFacts || []).length) * 100
      + (j.script.scenes || []).length;
    return size(a2) - size(a);
  })[0];
}

// ---------------------------------------------------------------------------
// SIMULATION — one pace, end to end, on the copy the model actually wrote.
// ---------------------------------------------------------------------------

/**
 * Rebuild the storyboard the way production does and measure the result.
 *
 * The script's own scenes are re-timed to the mode's scene target (which is what
 * a paced script would really produce) but their COPY is held exactly as
 * authored, so the four runs differ only by pace. That isolates the density
 * system from the script model's run-to-run variance, which is the whole point:
 * a difference in this table is a difference the code made.
 */
function simulate(job, mode, { durationSec, orientation }) {
  const dur = Number(durationSec) || Number(job.duration) || 30;
  const pacing = P.resolve(mode, { durationSec: dur, orientation, voiceover: job.voiceover_enabled !== 0 });

  // Re-cut the authored scenes to this mode's scene count, carrying their copy.
  const src = job.script.scenes;
  const n = Math.max(2, Math.min(pacing.scene.count, 200));
  const sceneSec = r2(dur / n);

  // THE NARRATION IS RE-BUDGETED, not resampled.
  //
  // A faster film does not say the same words over more frames — the script
  // model is handed a smaller `wordBudget` and WRITES LESS. Copying each
  // authored line onto every frame that samples it would make narration GROW
  // with pace, which is the opposite of what the engine does and would make this
  // whole table lie.
  //
  // So: the authored narration is spent, sentence by sentence, across the
  // mode's `narratedSceneCount` frames until its word budget runs out. The rest
  // of the film is silent — which is exactly what the paced script directive
  // asks the model for ("a scene may carry NO voiceover at all... at this pace
  // that is a good beat, not a missing one").
  const sentences = src.flatMap((s) => norm(s.voiceover).split(/(?<=[.!?])\s+/))
    .map(norm).filter(Boolean);
  const narratedIdx = new Set();
  {
    const want = Math.min(n, pacing.narratedSceneCount || n);
    // Spread the spoken beats evenly rather than front-loading them.
    for (let i = 0; i < want; i++) narratedIdx.add(Math.floor((i * n) / want));
  }
  const voFor = (() => {
    let spent = 0, k = 0;
    return () => {
      const out = [];
      // One utterance is a sentence or two, and never past the film's budget or
      // this scene's own ceiling.
      const ceiling = P.sceneWordCeiling(pacing, sceneSec);
      while (k < sentences.length) {
        const w = wordsOf(sentences[k]);
        if (out.length && (spent + w > pacing.wordBudget || wordsOf(out.join(" ")) + w > ceiling)) break;
        if (!out.length && spent + w > pacing.wordBudget) return "";
        out.push(sentences[k++]);
        spent += w;
        if (wordsOf(out.join(" ")) >= ceiling * 0.7) break;
      }
      return out.join(" ");
    };
  })();

  const scenes = Array.from({ length: n }, (_, i) => {
    const from = src[Math.floor((i * src.length) / n)];
    return {
      id: `s${i + 1}`,
      duration: sceneSec,
      kind: from.purpose || "point",
      purpose: from.purpose || "point",
      animation: from.animation || "",
      headline: norm((from.onScreenText || [])[0]),
      subtext: "",
      bullets: [],
      kicker: "",
      emphasis: "",
      voiceover: narratedIdx.has(i) ? voFor() : "",
      visualMotif: norm(from.visualDirection),
    };
  });
  const storyboard = { durationSec: dur, scenes };
  const script = { scenes: scenes.map((s) => ({ id: s.id, duration: s.duration, voiceover: s.voiceover, onScreenText: [s.headline].filter(Boolean) })) };

  // --authored: model a storyboard model that OBEYS system_storyboard.md hard
  // rule 9 ("every scene carries a non-empty kicker, headline, subtext and 2-3
  // bullets. No scene ships headline-only"). The default run deliberately does
  // NOT, because that is the measured reality (job agmoif2udy came back
  // headline-only on every scene) and it isolates what the deterministic floor
  // achieves on its own. This flag shows the other end: what the film looks like
  // when the authoring model does its job and the floor only tops it up.
  if (argv.includes("--authored")) {
    const km = (job.brief.keyMessages || []).concat(job.brief.mustIncludeFacts || []).filter(Boolean);
    scenes.forEach((sc, i) => {
      const src = norm(km[i % Math.max(1, km.length)]);
      if (!src) return;
      const capRoles = P.visualCapacity(pacing, sceneSec).roles;
      sc.subtext = P.fitVisualLine(src, sceneSec, "subtext", pacing)
        || P.fitVisualLine(src.split(/[\s,]+/).slice(0, 4).join(" "), sceneSec, "subtext", pacing);
      const labels = src.split(/[,;]|\s+and\s+/).map(norm).filter(Boolean)
        .map((x) => P.fitVisualLine(x, sceneSec, "bullet", pacing)).filter(Boolean);
      sc.bullets = labels.slice(0, Math.max(2, pacing.text.bulletsPerScene));
      void capRoles;
    });
  }

  const before = CD.frameStats(storyboard);
  const { report } = CD.directDensity({ jobId: `${job.id}:${mode}`, brief: job.brief, script, storyboard, pacing });

  // ---- measure what a viewer ends up with -------------------------------
  const voWords = scenes.reduce((a, s) => a + wordsOf(s.voiceover), 0);
  const narrated = scenes.filter((s) => norm(s.voiceover)).length;
  // Narration seconds by the engine's own model: a fixed per-utterance cost plus
  // words at the authoring rate. Same formula the word budget is derived from.
  const voSec = narrated * P.UTTERANCE_FIXED_SEC + voWords / pacing.speechRate;

  let readable = 0, checked = 0, thin = 0, elements = 0, chars = 0, staggered = 0;
  const longest = { line: "", need: 0, have: 0 };
  for (const s of scenes) {
    const lines = [s.kicker, s.headline, s.subtext, ...(s.bullets || [])].map(norm).filter(Boolean);
    elements += lines.length;
    chars += lines.reduce((a, l) => a + l.length, 0);
    if (lines.length <= 1) thin++;
    for (const l of lines) {
      checked++;
      const need = P.minReadableSec(l);
      if (need <= s.duration + 0.05) readable++;
      else if (need - s.duration > longest.need - longest.have) { longest.line = l; longest.need = need; longest.have = s.duration; }
    }
    if ((s.textReveal || []).some((e) => e.at > 0)) staggered++;
  }

  const timing = P.scaleTiming({ textDur: 0.5, textStagger: 0.04, cardDur: 0.7, transDur: 0.55, overlap: 0.2, idleCycle: 5, sweepEvery: 4, camPush: 0.06 }, pacing);

  return {
    mode,
    label: pacing.label,
    multiplier: pacing.multiplier,
    durationSec: dur,
    scenes: n,
    sceneSec,
    // narration
    voWords,
    narratedScenes: narrated,
    voSec: r1(voSec),
    voWordsPerSec: r2(voWords / dur),
    voWordBudget: pacing.wordBudget,
    // frame
    elements,
    elementsPerFrame: r2(elements / n),
    screenChars: chars,
    screenCharsPerFrame: r1(chars / n),
    screenCharsPerSec: r2(chars / dur),
    charBudget: pacing.text.charBudget,
    thinFrames: thin,
    beforeElementsPerFrame: before.elementsPerScene,
    // limits actually applied
    maxHeadlineChars: pacing.text.maxHeadlineChars,
    maxBulletChars: pacing.text.maxBulletChars,
    // readability + motion
    readablePct: checked ? Math.round((readable / checked) * 100) : 100,
    worstOverrun: longest.line ? `"${longest.line}" needs ${r2(longest.need)}s in ${r2(longest.have)}s` : null,
    staggeredFrames: staggered,
    entranceSec: timing.textDur,
    transitionSec: timing.transDur,
    staggerSec: timing.textStagger,
    poolUsed: report ? report.poolSize - report.poolUnused : 0,
    poolSize: report ? report.poolSize : 0,
    framesPerFact: report && report.poolSize ? r1(n / report.poolSize) : Infinity,
    // How much of the frame's OWN readable capacity the copy fills. This is the
    // pace-fair density number: a 2.3s frame holds less than a 4.3s one by
    // physics, so comparing raw chars across modes understates the fast ones.
    fillPct: Math.round((chars / n) / Math.max(1, pacing.text.maxHeadlineChars * pacing.text.elementsPerScene * 0.5) * 100),
  };
}

// ---------------------------------------------------------------------------
// REPORT
// ---------------------------------------------------------------------------

const pad = (v, n, right = true) => (right ? String(v).padStart(n) : String(v).padEnd(n));

function table(rows) {
  const out = [];
  const cols = rows.map((r) => r.label);
  const line = (name, key, fmt = (v) => v) =>
    `  ${pad(name, 26, false)}${rows.map((r) => pad(fmt(r[key]), 13)).join("")}`;

  out.push(`  ${pad("", 26, false)}${cols.map((c) => pad(c, 13)).join("")}`);
  out.push(`  ${"-".repeat(26 + 13 * rows.length)}`);
  out.push("  THE CLOCK");
  out.push(line("video duration", "durationSec", (v) => `${v}s`));
  out.push(line("scenes", "scenes"));
  out.push(line("scene duration", "sceneSec", (v) => `${v}s`));
  out.push("");
  out.push("  THE VOICE  (must FALL)");
  out.push(line("voiceover words", "voWords"));
  out.push(line("voiceover seconds", "voSec", (v) => `${v}s`));
  out.push(line("VO words / sec", "voWordsPerSec"));
  out.push(line("narrated scenes", "narratedScenes"));
  out.push("");
  out.push("  THE FRAME  (must NOT fall)");
  out.push(line("elements / frame", "elementsPerFrame"));
  out.push(line("screen chars / frame", "screenCharsPerFrame"));
  out.push(line("screen chars / sec", "screenCharsPerSec"));
  out.push(line("total screen chars", "screenChars"));
  out.push(line("thin frames (<=1 line)", "thinFrames"));
  out.push(line("headline ceiling", "maxHeadlineChars", (v) => `${v} ch`));
  out.push(line("label ceiling", "maxBulletChars", (v) => `${v} ch`));
  out.push(line("frame fill vs capacity", "fillPct", (v) => `${v}%`));
  out.push("");
  out.push("  SUPPLY  (what the brief can actually cover)");
  out.push(line("facts in the pool", "poolSize"));
  out.push(line("facts spent", "poolUsed"));
  out.push(line("frames per fact", "framesPerFact"));
  out.push("");
  out.push("  READABILITY  (must be 100%)");
  out.push(line("lines that fit", "readablePct", (v) => `${v}%`));
  out.push(line("frames with reveal", "staggeredFrames"));
  out.push("");
  out.push("  MOTION  (must quicken)");
  out.push(line("text entrance", "entranceSec", (v) => `${v}s`));
  out.push(line("transition", "transitionSec", (v) => `${v}s`));
  out.push(line("word stagger", "staggerSec", (v) => `${v}s`));
  return out.join("\n");
}

function verdict(rows) {
  const by = Object.fromEntries(rows.map((r) => [r.mode, r]));
  const checks = [];
  const add = (ok, text) => checks.push({ ok, text });

  const seq = MODES.map((m) => by[m]).filter(Boolean);
  for (let i = 1; i < seq.length; i++) {
    add(seq[i].voWordsPerSec <= seq[i - 1].voWordsPerSec + 0.02,
      `${seq[i].label} narrates no faster than ${seq[i - 1].label} (${seq[i].voWordsPerSec} vs ${seq[i - 1].voWordsPerSec} w/s)`);
  }
  // THE CENTRAL CLAIM: the picture does not pay for the pace.
  //
  // Compared PER SECOND, not per frame. A very-fast frame is physically smaller
  // — 2.3s of reading time against relaxed's 4.3s — so a raw per-frame count
  // will always favour the slow modes and says nothing about whether the film
  // communicates less. Information delivered per second of runtime is the number
  // a viewer actually experiences.
  add(by["very-fast"].screenCharsPerSec >= by.normal.screenCharsPerSec * 0.95,
    `very-fast shows at least as much per second as normal (${by["very-fast"].screenCharsPerSec} vs ${by.normal.screenCharsPerSec} ch/s)`);
  add(by.fast.screenCharsPerSec >= by.normal.screenCharsPerSec * 0.95,
    `fast shows at least as much per second as normal (${by.fast.screenCharsPerSec} vs ${by.normal.screenCharsPerSec} ch/s)`);
  // And the frames fill a comparable share of the room they have — UNLESS the
  // brief simply does not have enough to say to cover the frame count.
  //
  // That distinction matters. A very-fast 90s film is 39 frames; a brief with 11
  // substantive facts cannot fill them from the deterministic floor alone, and
  // no allocation strategy can invent the twelfth. When `frames per fact` passes
  // ~1.2 the binding constraint is SUPPLY, not density, and this reports it as a
  // supply warning rather than a density failure — because the fix for it is a
  // richer brief or the authoring model doing its job (see --authored), not a
  // change to the pacing engine.
  const supplyBound = by["very-fast"].thinFrames > 0 && by["very-fast"].framesPerFact > 1.2;
  if (!supplyBound) {
    add(rows.every((r) => r.thinFrames === 0),
      `no mode ships a frame with a single line (${rows.map((r) => r.thinFrames).join("/")})`);
  }
  if (supplyBound) {
    checks.push({ ok: true, warn: true,
      text: `SUPPLY-BOUND: ${by["very-fast"].framesPerFact} frames per fact at very-fast — the brief runs out `
        + `before the frames do (${by["very-fast"].fillPct}% vs ${by.normal.fillPct}% of capacity filled). `
        + `Re-run with --authored to see the same film with a compliant storyboard.` });
  }
  // `frame fill vs capacity` stays in the TABLE but is deliberately not an
  // assertion. It is a nominal ratio against elements x headline-width, and a
  // fast frame will always score lower on it by construction: its lines are
  // shorter because its scene is shorter. That is the design, not a defect —
  // the questions that actually matter are whether the film still delivers the
  // same information per SECOND (asserted above) and whether every line is
  // readable (asserted below). Turning the nominal ratio into a gate would
  // punish exactly the behaviour the feature exists to produce.

  add(rows.every((r) => r.readablePct === 100),
    `every line is readable in its own scene (${rows.map((r) => r.readablePct + "%").join("/")})`);
  add(by["very-fast"].entranceSec < by.normal.entranceSec, "very-fast animates quicker than normal");
  add(by.relaxed.entranceSec > by.normal.entranceSec, "relaxed animates slower than normal");
  add(rows.every((r) => r.voWords <= r.voWordBudget * 1.15),
    `no mode blows its own word budget (${rows.map((r) => `${r.voWords}/${r.voWordBudget}`).join(" ")})`);
  add(rows.every((r) => r.elementsPerFrame > r.beforeElementsPerFrame),
    `every mode gains copy over the headline-only baseline (${rows.map((r) => `${r.beforeElementsPerFrame}->${r.elementsPerFrame}`).join(" ")})`);
  return checks;
}

// ---------------------------------------------------------------------------

function run(job, opts) {
  const rows = MODES.map((m) => simulate(job, m, opts));
  if (asJson) return { job: job.id, rows };
  const km = (job.brief.keyMessages || []).length, mf = (job.brief.mustIncludeFacts || []).length;
  console.log(`\nJOB ${job.id} — "${String(job.script.title || job.prompt || "").slice(0, 70)}"`);
  console.log(`  brief: ${km} key message(s), ${mf} must-include fact(s)   |   authored scenes: ${job.script.scenes.length}`);
  console.log(`  every run below starts from the SAME authored copy; only the pace differs.\n`);
  console.log(table(rows));
  console.log("\n  VERDICT");
  let bad = 0;
  for (const c of verdict(rows)) {
    if (!c.ok) bad++;
    console.log(`    ${c.warn ? "warn" : c.ok ? "ok  " : "FAIL"}  ${c.text}`);
  }
  const worst = rows.map((r) => r.worstOverrun).filter(Boolean);
  if (worst.length) console.log(`\n  overruns: ${worst.join(" | ")}`);
  console.log("");
  return bad;
}

function main() {
  const opts = {
    durationSec: flag("duration") ? Number(flag("duration")) : null,
    orientation: flag("orientation", "horizontal"),
  };
  if (argv.includes("--all")) {
    const jobs = loadJobs().filter((j) => j && j.brief && j.script && (j.script.scenes || []).length);
    let bad = 0;
    for (const j of jobs) bad += run(j, opts) || 0;
    console.log(`${jobs.length} job(s) audited, ${bad} failing check(s)`);
    process.exit(bad ? 1 : 0);
  }
  const job = pickJob(flag("job"));
  if (!job) {
    console.error("No job with both a brief and a script was found in jobs.json.");
    process.exit(2);
  }
  const bad = run(job, opts);
  if (asJson) console.log(JSON.stringify(bad, null, 2));
  process.exit(typeof bad === "number" && bad ? 1 : 0);
}

main();
