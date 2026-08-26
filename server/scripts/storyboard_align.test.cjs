// Guard: the picture's scene list and the narration's scene list are the SAME list.
//
// The narration is synthesized per SCRIPT scene and mixed at that script scene's
// own start (voiceAgent -> audio_mix). The picture is built from the STORYBOARD's
// scenes. Nothing reconciled the two: retimeScenesToVo pairs them by id and
// skips whatever does not pair up, and no validation ever compared the counts.
//
// They disagreed by construction on any long film. system_storyboard.md caps the
// director at 20 scenes with 2-7s durations; a 300s approved script is ~50 scenes
// and a 600s one ~70. normalizeTimeline then stretched the director's 20 scenes to
// 15s each to reach the requested length, so the film played 20 long slides while
// 50-70 narration clips were laid down on the script's own clock — most of them at
// offsets no scene boundary had agreed to. That is not a beat out of step; it is
// two different films sharing one MP4.
//
//   npm run test:sbalign

const assert = require("node:assert");
const { alignToScript, normalizeTimeline, validate } = require("../src/services/storyboard");

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

// Varied lengths on purpose (equal ones let a rescale land back in place and
// hide a drift), but inside the band a real script actually uses: normalizeScript
// admits [1,15]s and system_script.md asks for 2.5-6s on films up to ~240s, so
// the spread here is +/-35% around the film's own average.
function script(n, total) {
  const base = total / n;
  const raw = []; let sum = 0;
  for (let i = 0; i < n; i++) { const d = base * (1 + 0.35 * Math.sin(i * 1.7)); raw.push(d); sum += d; }
  const k = total / sum;
  const scenes = []; let t = 0;
  raw.forEach((d0, i) => {
    const d = Math.round(d0 * k * 100) / 100;
    scenes.push({
      id: `s${i + 1}`, start: Math.round(t * 100) / 100, duration: d,
      purpose: i === 0 ? "hook" : "point",
      onScreenText: [`line ${i + 1} alpha`, `line ${i + 1} beta`],
      voiceover: `narration for scene ${i + 1}.`,
      visualDirection: "something moves",
    });
    t += d;
  });
  return { title: "T", scenes };
}

// What the director actually returns for a long film once its own rules and
// normalizeTimeline have had their way: 20 scenes stretched to fill the runtime.
function directed(total, n = 20) {
  const sb = {
    title: "T", durationSec: total, orientation: "horizontal",
    palette: { background: "#000", text: "#fff" },
    scenes: Array.from({ length: n }, (_, i) => ({
      id: `s${i + 1}`, start: 0, duration: total / n,
      kind: i === 0 ? "hook" : i === n - 1 ? "cta" : "point",
      animation: "slide", layout: "centered", visualMotif: "orb",
      headline: `DIRECTOR LINE ${i + 1}`, subtext: `director support ${i + 1}`,
      bullets: [`d${i + 1} one`, `d${i + 1} two`],
      voiceover: `director vo ${i + 1}`,
      beats: [{ at: 0.1, action: "in", easing: "power2.out" }, { at: total / n - 1, action: "out", easing: "power2.in" }],
    })),
  };
  normalizeTimeline(sb, total);
  return sb;
}

for (const [label, total, n] of [["90s", 90, 26], ["300s", 300, 50], ["600s", 600, 70]]) {
  const sc = script(n, total);
  const sb = directed(total);
  const before = sb.scenes.length;
  alignToScript(sb, sc, "test");

  ok(`${label}: the storyboard ends up with one scene per script scene`, () => {
    assert.strictEqual(sb.scenes.length, sc.scenes.length, `${before} directed scenes became ${sb.scenes.length}, script has ${sc.scenes.length}`);
  });

  ok(`${label}: every scene keeps the script's id, start and duration`, () => {
    sb.scenes.forEach((s, i) => {
      assert.strictEqual(String(s.id), String(sc.scenes[i].id), `scene ${i} id ${s.id} != ${sc.scenes[i].id}`);
      assert.ok(Math.abs(s.start - sc.scenes[i].start) <= 0.02, `scene ${i} start ${s.start} != ${sc.scenes[i].start}`);
      assert.ok(Math.abs(s.duration - sc.scenes[i].duration) <= 0.02, `scene ${i} duration ${s.duration} != ${sc.scenes[i].duration}`);
    });
  });

  ok(`${label}: every scene speaks its own script line`, () => {
    sb.scenes.forEach((s, i) => {
      assert.strictEqual(s.voiceover, sc.scenes[i].voiceover, `scene ${i} narration came from somewhere else`);
    });
  });

  ok(`${label}: the screen shows the script's own words, not the director's`, () => {
    const borrowed = sb.scenes.filter((s) => /^DIRECTOR LINE/.test(String(s.headline || "")));
    assert.strictEqual(borrowed.length, 0, `${borrowed.length} scene(s) display a directed headline while a different script line is spoken`);
  });

  ok(`${label}: no two consecutive scenes stamp the same headline`, () => {
    for (let i = 1; i < sb.scenes.length; i++) {
      const a = String(sb.scenes[i - 1].headline || "").trim().toLowerCase();
      const b = String(sb.scenes[i].headline || "").trim().toLowerCase();
      assert.ok(!a || a !== b, `scenes ${i} and ${i + 1} both read "${b}" — the picture stops advancing with the voice`);
    }
  });

  ok(`${label}: the aligned storyboard still passes its own validator`, () => {
    const errs = validate(sb, { duration: sb.durationSec, orientation: "horizontal" });
    assert.strictEqual(errs.length, 0, errs.slice(0, 3).join("; "));
  });
}

// A storyboard that already matches the script is left completely alone — the
// alignment must not churn a film that was built correctly.
ok("a storyboard that already matches the script is untouched", () => {
  const sc = script(8, 30);
  const sb = {
    title: "T", durationSec: 30, orientation: "horizontal",
    palette: { background: "#000", text: "#fff" },
    scenes: sc.scenes.map((s, i) => ({
      id: s.id, start: s.start, duration: s.duration,
      kind: i === 0 ? "hook" : "point", animation: "slide",
      headline: `KEEP ${i}`, subtext: "keep", voiceover: s.voiceover,
    })),
  };
  const snapshot = JSON.stringify(sb);
  alignToScript(sb, sc, "test");
  assert.strictEqual(JSON.stringify(sb), snapshot, "an already-aligned storyboard was rewritten");
});

console.log(fail ? `\n${fail} failing` : `\nthe picture and the narration share one scene list (${pass} checks)`);
process.exit(fail ? 1 : 0);
