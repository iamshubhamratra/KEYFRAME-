// Guard: a film covers its runtime at a watchable pace, whatever the director returns.
//
// The single-shot path (/api/generate -> runJob) has no script — it asks the
// director for a storyboard straight from the prompt, and that storyboard IS the
// film's scene list and the narration's scene list at once. Scene durations are
// clamped to [2,15], so the count the director chooses decides the arithmetic:
//
//   300s from 20 scenes -> every scene pinned to the 15s ceiling. Legal, so it
//                          shipped: a five-minute film that cuts twenty times.
//   600s from 20 scenes -> unreachable. normalizeTimeline landed on 300s,
//                          validate() said "durations sum to 300, expected 600",
//                          and generateStoryboard THREW after its retries. A
//                          ten-minute single-shot job could not be made at all.
//
// system_storyboard.md capped the director at 20 scenes, so both were the normal
// case rather than the exception. The prompt now scales that count with the
// runtime; storyboard.expandToCover is the deterministic floor under it.
//
//   npm run test:sbcover

const assert = require("node:assert");
const { normalizeTimeline, validate } = require("../src/services/storyboard");

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

// `rich` is what a director that followed its brief returns — several sentences
// of narration and a support line per scene. `thin` is the worst case: one
// sentence, no second facet, nothing a cut can hand the second frame.
function directed(n, { rich = true } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`, start: 0, duration: 4,
    kind: i === 0 ? "hook" : i === n - 1 ? "cta" : "point",
    animation: "slide", layout: "centered",
    headline: `Headline number ${i}`,
    subtext: rich ? `A supporting line for scene ${i}.` : "",
    bullets: rich ? [`point ${i}a`, `point ${i}b`] : [],
    voiceover: rich
      ? `First sentence of scene ${i}. Second sentence of scene ${i}. Third sentence of scene ${i}.`
      : `Only one line for scene ${i}.`,
    beats: [{ at: 0.1, action: "in", easing: "power2.out" }, { at: 3.4, action: "out", easing: "power2.in" }],
  }));
}

function film(n, duration, opts) {
  const sb = {
    title: "T", durationSec: duration, orientation: "horizontal",
    palette: { background: "#0b0b0b", text: "#ffffff" },
    scenes: directed(n, opts),
  };
  normalizeTimeline(sb, duration);
  return sb;
}

const stats = (sb, duration) => {
  const sum = sb.scenes.reduce((a, s) => a + s.duration, 0);
  return {
    n: sb.scenes.length,
    covers: Math.round(sum * 100) / 100,
    avg: sum / sb.scenes.length,
    longest: Math.max(...sb.scenes.map((s) => s.duration)),
    silent: sb.scenes.filter((s) => !String(s.voiceover || "").trim()).length,
    echo: sb.scenes.filter((s, i) => i > 0 && String(s.headline) === String(sb.scenes[i - 1].headline)).length,
    dupIds: sb.scenes.length - new Set(sb.scenes.map((s) => String(s.id))).size,
    errs: validate(sb, { duration, orientation: "horizontal" }),
  };
};

// A director that under-delivers on a long film — the case that used to fail the
// job outright, and the case that used to ship as a wall of 15s slides.
for (const [label, n, D] of [["300s from 20 scenes", 20, 300], ["600s from 20 scenes", 20, 600]]) {
  const sb = film(n, D);
  const s = stats(sb, D);

  ok(`${label}: the film covers its whole runtime`, () => {
    assert.ok(Math.abs(s.covers - D) < 0.5, `covers ${s.covers}s of a ${D}s film`);
  });
  ok(`${label}: the storyboard still validates`, () => {
    assert.strictEqual(s.errs.length, 0, s.errs.slice(0, 2).join("; "));
  });
  ok(`${label}: no scene is held at the ceiling`, () => {
    assert.ok(s.longest <= 12.5, `longest scene runs ${s.longest}s — a held frame, not a beat`);
  });
  ok(`${label}: it cuts at a watchable pace`, () => {
    // The bar is what the MATERIAL allows: a cut needs a sentence to speak, so a
    // director that wrote three sentences a scene can be cut into thirds and no
    // further. Three sentences over 600s is ~10s a beat, and that is the honest
    // ceiling — not the 15s hold this replaced.
    assert.ok(s.avg <= 11, `${s.n} scenes averaging ${s.avg.toFixed(1)}s`);
  });
  ok(`${label}: every scene still has its own narration`, () => {
    assert.strictEqual(s.silent, 0, `${s.silent} scene(s) ended up with no narration at all`);
  });
  ok(`${label}: no two scenes in a row say the same thing`, () => {
    assert.strictEqual(s.echo, 0, `${s.echo} scene(s) repeat the previous headline — the picture stops advancing`);
  });
  ok(`${label}: scene ids stay unique`, () => {
    assert.strictEqual(s.dupIds, 0, `${s.dupIds} duplicate id(s) — the VO clips are keyed by id`);
  });
}

// Worst cases: nothing left for a cut to divide — one sentence and no support
// line, or so few scenes that ten minutes cannot be narrated from them at all.
// The film must still cover its runtime (that is arithmetic) and must still
// validate; it is allowed to hold longer frames and to repeat, because there is
// genuinely nothing else to put on the second frame. What it must NOT do is
// fail, or silently come up short.
{
  const D = 600;
  const sb = film(20, D, { rich: false });
  const s = stats(sb, D);
  ok("thin material: the film still covers its runtime and validates", () => {
    assert.ok(Math.abs(s.covers - D) < 0.5, `covers ${s.covers}s of a ${D}s film`);
    assert.strictEqual(s.errs.length, 0, s.errs.slice(0, 2).join("; "));
  });
  ok("thin material: ids stay unique", () => {
    assert.strictEqual(s.dupIds, 0, `${s.dupIds} duplicate id(s)`);
  });

  const few = film(8, D);
  const f = stats(few, D);
  ok("8 scenes for a 600s film: covers its runtime and validates", () => {
    assert.ok(Math.abs(f.covers - D) < 0.5, `covers ${f.covers}s of a ${D}s film`);
    assert.strictEqual(f.errs.length, 0, f.errs.slice(0, 2).join("; "));
    assert.strictEqual(f.dupIds, 0, `${f.dupIds} duplicate id(s)`);
  });
  ok("8 scenes for a 600s film: no frame is left silent", () => {
    assert.strictEqual(f.silent, 0, `${f.silent} scene(s) have nothing to say`);
  });
}

// A storyboard that already paces itself is never touched — this is a floor, not
// a style. Short films are the overwhelming majority of jobs and must be byte-
// identical through it.
for (const [label, n, D] of [["30s / 9 scenes", 9, 30], ["90s / 26 scenes", 26, 90], ["600s / 70 scenes", 70, 600]]) {
  ok(`${label}: a well-paced storyboard passes through unsplit`, () => {
    const sb = {
      title: "T", durationSec: D, orientation: "horizontal",
      palette: { background: "#0b0b0b", text: "#ffffff" },
      scenes: directed(n),
    };
    const before = sb.scenes.length;
    normalizeTimeline(sb, D);
    assert.strictEqual(sb.scenes.length, before, `${before} scenes became ${sb.scenes.length}`);
    const errs = validate(sb, { duration: D, orientation: "horizontal" });
    assert.strictEqual(errs.length, 0, errs.slice(0, 2).join("; "));
  });
}

console.log(fail ? `\n${fail} failing` : `\nevery film covers its runtime at a watchable pace (${pass} checks)`);
process.exit(fail ? 1 : 0);
