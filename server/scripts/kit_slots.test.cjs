// Guard: the long-form kit's SINGLE-TOKEN and SEQUENCE slots.
//
// The kit that shipped with the 58-film handoff draws two kinds of slot the
// generic rack/label fill gets wrong in opposite directions:
//
//   `word`  — ONE hero token. Kaleido mirrors it six ways at 96px and again at
//             150px in the middle; LongShadow throws a sun-arc shadow off it;
//             ZoomThrough flies it past the camera; Emboss carves it; Perimeter
//             patrols it. Ninety scenes across the 58 films author one. It was
//             mapped NOWHERE — `words` is a different key — so it fell through to
//             the generic unmapped-string fill, which rejects a bare token under
//             twelve characters as an enum and returns "". Kaleido drew six
//             mirrored blanks around a blank.
//
//   sequences — Countdown authors steps ["3","2","1","GO"] and draws ONE entry at
//             a time at 400px; TearOff authors months ["MARCH","MAY","AUGUST",
//             "NOVEMBER"] on its calendar leaves. The generic rack fill replaced
//             both with 30-character sentence fragments, and the 16KB payload
//             shrinker then cut whatever survived to two entries — saving about
//             twenty bytes and leaving a countdown that counts to two and stops.
//
// All three are asserted here against REAL installed packs, so a future change to
// the fill order, the width budget or the shrinker has to keep them true.

const assert = require("node:assert");
const adapter = require("../src/services/omelette_adapter");

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

const HEADS = [
  "The engine bay stays cool under load",
  "Two point four seconds in the pit box",
  "Brake later, not harder",
  "Seven tenths live on one corner",
];
const SUBS = [
  "Measured across eleven laps and two pit stops, the gap never closed.",
  "A 2.4s stop is 40% of the delta over a full stint.",
  "We ran 312 laps this season and 18 of them mattered.",
];

function compose(framePack, { durationSec = 300, nScenes = 42, figures = true } = {}) {
  const scenes = [];
  const each = durationSec / nScenes;
  let t = 0;
  for (let i = 0; i < nScenes; i++) {
    scenes.push({
      id: `s${i + 1}`, start: t, duration: each,
      kind: i === 0 ? "title" : i === nScenes - 1 ? "cta" : "point",
      headline: HEADS[i % HEADS.length],
      subtext: SUBS[i % SUBS.length],
      emphasis: ["TENTHS", "APEX", "GRIP", "BOX"][i % 4],
      voiceover: "Seven tenths of a second live on one corner of this circuit.",
      onScreenText: ["Brake later", "Turn in early", "Hold the apex", "Exit wide"],
      ...(figures ? { stats: [{ value: "2.4", label: "second stop" }, { value: "312", label: "laps run" }] } : {}),
    });
    t += each;
  }
  const built = adapter.buildComposition({
    storyboard: { title: "A film", durationSec, scenes },
    dims: { width: 1920, height: 1080, fps: 30 },
    framePack, assets: [], captionCues: null,
  });
  const blk = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(built.indexHtml);
  const page = JSON.parse(blk[1]);
  const m = /window\.OM_SCENES\s*=\s*("(?:[^"\\]|\\.)*")\s*;/.exec(page);
  return JSON.parse(JSON.parse(m[1]));
}

// apex-lap authors Kaleido, LongShadow, Countdown and TearOff; hay-and-holler
// authors a countdown that does not start at 3 ("5","4","30","NOW").
//
// Which shapes get CAST depends on the script — the figure shapes are refused to
// a script with no figures, which changes the rotation and therefore what else
// lands. So each pack is composed twice, with and without figures, and the
// assertions look across both: that is what keeps a shape in view when a casting
// change moves it, instead of the test quietly asserting nothing.
const PACKS = ["apex-lap", "hay-and-holler", "tinsel-row"];
const composed = {};
for (const p of PACKS) {
  composed[`${p} (figures)`] = compose(p);
  composed[`${p} (no figures)`] = compose(p, { nScenes: 40, figures: false });
}

ok("every `word` slot says a real word, never a blank", () => {
  let seen = 0;
  for (const [pack, om] of Object.entries(composed)) {
    for (const s of om) {
      if (!Object.prototype.hasOwnProperty.call(s, "word")) continue;
      seen++;
      assert.ok(String(s.word).trim(), `${pack} ${s.name}.word is blank`);
    }
  }
  assert.ok(seen >= 3, `no word slots cast at all (${seen}) — the probe stopped covering them`);
});

ok("a `word` is never cut mid-word", () => {
  for (const [pack, om] of Object.entries(composed)) {
    for (const s of om) {
      if (!Object.prototype.hasOwnProperty.call(s, "word")) continue;
      // Every token must be a word the script actually contains, not a prefix of
      // one: "TENTHS" rendered as "TENTH" is a typo six times over.
      const hay = `${HEADS.join(" ")} ${SUBS.join(" ")} TENTHS APEX GRIP BOX Seven tenths of a second live on one corner of this circuit.`.toLowerCase();
      for (const w of String(s.word).toLowerCase().split(/\s+/).filter(Boolean)) {
        const bare = w.replace(/[^a-z0-9%]/g, "");
        if (!bare) continue;
        assert.ok(new RegExp(`\\b${bare}\\b`).test(hay), `${pack} ${s.name}.word "${s.word}" is not a whole word of the script`);
      }
    }
  }
});

ok("a countdown keeps every authored step, in order", () => {
  let seen = 0;
  for (const [pack, om] of Object.entries(composed)) {
    for (const s of om) {
      if (s.name !== "Countdown") continue;
      seen++;
      assert.ok(Array.isArray(s.steps), `${pack} Countdown.steps is not an array`);
      assert.ok(s.steps.length >= 4, `${pack} Countdown.steps truncated to ${s.steps.length}: ${JSON.stringify(s.steps)}`);
      // A countdown counts DOWN — every entry is short enough to draw at 400px.
      for (const step of s.steps) {
        assert.ok(String(step).length <= 6, `${pack} Countdown.steps carries prose: ${JSON.stringify(step)}`);
      }
    }
  }
  assert.ok(seen >= 1, "Countdown was never cast — the probe stopped covering it");
});

ok("a tear-off calendar keeps its own dates", () => {
  let seen = 0;
  for (const [pack, om] of Object.entries(composed)) {
    for (const s of om) {
      if (s.name !== "TearOff" || !Array.isArray(s.months)) continue;
      seen++;
      assert.ok(s.months.length >= 4, `${pack} TearOff.months truncated to ${s.months.length}`);
      for (const mo of s.months) {
        assert.ok(/^[A-Za-z0-9]{1,10}\.?$/.test(String(mo).trim()), `${pack} TearOff.months carries prose: ${JSON.stringify(mo)}`);
      }
    }
  }
  assert.ok(seen >= 1, "TearOff was never cast — the probe stopped covering it");
});

ok("a rack of the film's own COPY is still replaced by the user's", () => {
  // The sequence guard must not swallow racks that are real copy. Flap authors
  // ["BUY","HOLD","SELL","WAIT"] on bull-run and short herb names elsewhere —
  // those are the demo film's words and must not survive into a user's film.
  let seen = 0;
  for (const [pack, om] of Object.entries(composed)) {
    for (const s of om) {
      if (s.name !== "Flap" || !Array.isArray(s.steps)) continue;
      seen++;
      const ours = s.steps.some((x) => /brake|turn|apex|exit/i.test(String(x)));
      assert.ok(ours, `${pack} Flap.steps kept the demo film's copy: ${JSON.stringify(s.steps)}`);
    }
  }
  assert.ok(seen >= 1, "Flap was never cast — the probe stopped covering it");
});

console.log(`\n${fail ? "FAILED" : "kit single-token and sequence slots hold"} (${pass} checks${fail ? `, ${fail} failing` : ""})`);
process.exit(fail ? 1 : 0);
