// VISUAL DENSITY, END TO END — the same film at every pace, measured.
//
// The complaint was "fast pace makes the video look empty". pace-density-report
// prints the BUDGETS; this prints what actually reaches the frame: it runs one
// fixed, content-rich script through the real deterministic chain (Text
// Director's miner -> scene_kit composition) at each pace and counts the
// on-screen text a viewer would see.
//
// Deterministic by default — the Text Director's LLM pass is disabled unless
// --llm is passed, so a density regression is visible without paying for four
// generations and without the run-to-run noise that would hide a small one.
// The deterministic miner is the FLOOR every film gets, which is exactly the
// thing worth pinning.
//
//   node scripts/pace-visual-density.js
//   node scripts/pace-visual-density.js --llm      # include the LLM pass
//   node scripts/pace-visual-density.js --scenes   # per-scene detail
const DETAIL = process.argv.includes("--scenes");
const USE_LLM = process.argv.includes("--llm");
// The Text Director is FAIL-OPEN: an LLM error falls through to the
// deterministic miner. So the way to hold this harness still is to make the
// call fail. (Setting config.textDirector.enabled = false does nothing —
// src/config.js freezes its export, so the assignment silently no-ops and the
// LLM runs anyway. That cost two runs of confusing, drifting numbers.)
if (!USE_LLM) {
  const openrouter = require("../src/services/openrouter");
  openrouter.chat = async () => { throw new Error("LLM disabled for the density harness"); };
}
const pacing = require("../src/services/pacing");
const { directText } = require("../src/services/text_director");
const MODES = ["relaxed", "normal", "fast", "veryFast"];
const DURATION = 60;

// A brief and script with MORE material than any one pace can show, so the
// measurement is of what each pace CHOOSES to surface rather than of how much
// source copy happened to exist.
const BRIEF = {
  subject: "Keyframe",
  improvedPrompt: "Keyframe turns a single idea into a finished, narrated video. It writes the script, finds the footage, records the voiceover and designs the motion. Teams ship 12000 films a month, 40+ templates, 99.9% uptime, and it costs $29/mo.",
  goal: "start a free trial",
  audience: "marketing teams",
  keyMessages: [
    "AI script generation from one line",
    "Asset intelligence finds the footage",
    "Automated voiceover in 30 languages",
    "Professional motion design, no editor",
    "Renders in under four minutes",
    "40+ templates across every format",
    "Brand colours applied automatically",
    "Export 4K, vertical and square",
  ],
};

function makeScript(P) {
  const t = pacing.sceneTargetFor(DURATION, P);
  const n = t.sceneCount;
  const dur = Math.round((DURATION / n) * 10) / 10;
  const V = P.visual;
  const scenes = [];
  for (let i = 0; i < n; i++) {
    const k = i % BRIEF.keyMessages.length;
    scenes.push({
      id: `s${i + 1}`, start: +(i * dur).toFixed(1), duration: dur,
      purpose: i === 0 ? "hook" : i === n - 1 ? "cta" : "feature",
      voiceover: BRIEF.keyMessages[k],
      // The writer fills the visual channel to the pace's own budget — which is
      // exactly what the PACE CONTRACT now asks it to do.
      onScreenText: [BRIEF.keyMessages[k]].slice(0, Math.max(4, V.keyPoints + 1)),
      keyPoints: BRIEF.keyMessages.slice(k, k + V.keyPoints).concat(BRIEF.keyMessages.slice(0, Math.max(0, V.keyPoints - (BRIEF.keyMessages.length - k)))).slice(0, V.keyPoints),
      metrics: [{ value: "12000", label: "films a month" }, { value: "99.9%", label: "uptime" }, { value: "40", label: "templates" }].slice(0, V.metrics),
    });
  }
  return { title: "Keyframe", scenes };
}

function makeStoryboard(script) {
  return {
    title: script.title, durationSec: DURATION,
    scenes: script.scenes.map((s, i) => ({
      id: s.id, start: s.start, duration: s.duration,
      kind: i === 0 ? "hook" : i === script.scenes.length - 1 ? "cta" : "feature",
      headline: `Beat ${i + 1}`,
      subtext: "", bullets: [], stats: [], voiceover: s.voiceover,
      onScreenText: s.onScreenText,
    })),
  };
}

(async () => {
  const rows = [];
  for (const key of MODES) {
    const P = pacing.resolve(key);
    const script = makeScript(P);
    const sb = makeStoryboard(script);
    // The deterministic miner is the floor every film gets, and it is the part a
    // regression can be pinned against.
    const before = JSON.stringify(sb);
    await directText({ jobId: null, brief: BRIEF, script, storyboard: sb, pacing: P })
      .catch(() => {});
    void before;

    let bullets = 0, subtextChars = 0, statCount = 0, scenesWithBullets = 0, scenesWithSub = 0;
    const per = [];
    for (const s of sb.scenes) {
      const b = (s.bullets || []).filter(Boolean);
      const sub = String(s.subtext || "");
      const st = (s.stats || []).filter(Boolean);
      bullets += b.length; subtextChars += sub.length; statCount += st.length;
      if (b.length) scenesWithBullets++;
      if (sub.trim()) scenesWithSub++;
      // What the RENDERER will actually lay out, after the layout cap.
      per.push({ id: s.id, shown: pacing.slotCount(3, P), bullets: b.length, sub: sub.length, stats: st.length });
    }
    const n = sb.scenes.length;
    const renderable = per.reduce((a, x) => a + Math.min(x.bullets, x.shown), 0);
    rows.push({
      key, P, n,
      bullets, renderable, statCount,
      bulletsPerScene: +(bullets / n).toFixed(2),
      renderablePerScene: +(renderable / n).toFixed(2),
      subPerScene: Math.round(subtextChars / n),
      pctBullets: Math.round((scenesWithBullets / n) * 100),
      pctSub: Math.round((scenesWithSub / n) * 100),
      per,
    });
  }

  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);
  console.log(`\nVISUAL DENSITY, MEASURED — same ${DURATION}s film, ${USE_LLM ? "with the LLM pass" : "deterministic miner only"}\n`);
  console.log(pad("mode", 10) + num("scenes", 7) + num("VOw/scene", 11) + num("bullets", 9)
    + num("b/scene", 9) + num("rendered", 10) + num("r/scene", 9) + num("stats", 7)
    + num("subCh/scn", 11) + num("%bullets", 10) + num("%subtext", 10));
  console.log("-".repeat(103));
  for (const r of rows) {
    console.log(pad(r.P.label, 10) + num(r.n, 7)
      + num(pacing.wordBudget(r.P.sceneSec, r.P), 11)
      + num(r.bullets, 9) + num(r.bulletsPerScene, 9)
      + num(r.renderable, 10) + num(r.renderablePerScene, 9)
      + num(r.statCount, 7) + num(r.subPerScene, 11)
      + num(r.pctBullets + "%", 10) + num(r.pctSub + "%", 10));
  }

  const base = rows.find((r) => r.key === "normal");
  console.log(`\nRELATIVE TO NORMAL — narration vs. what the frame shows\n`);
  console.log(pad("mode", 10) + num("VOw/scene", 11) + num("shown/scene", 13) + num("verdict", 34));
  console.log("-".repeat(69));
  for (const r of rows) {
    // PER SCENE, not per film. A viewer watches one scene at a time, and Relaxed
    // covers the same runtime with fewer, longer scenes — so a film total would
    // mark its (correct) 14-scene plan as a density loss.
    const vo = pacing.wordBudget(r.P.sceneSec, r.P) / pacing.wordBudget(base.P.sceneSec, base.P);
    const vis = r.renderablePerScene / base.renderablePerScene;
    const verdict = r.key === "normal" ? "baseline"
      : vis < 0.95 ? "FRAME LOST INFORMATION"
      : vo < 0.95 ? "narration down, frame holds up"
      : "ok";
    console.log(pad(r.P.label, 10) + num(vo.toFixed(2), 11) + num(vis.toFixed(2), 13) + num(verdict, 34));
  }
  console.log("");

  if (DETAIL) {
    for (const r of rows) {
      console.log(`--- ${r.P.label} (${r.n} scenes, layout shows ${r.per[0].shown}/scene) ---`);
      for (const x of r.per.slice(0, 8)) console.log(`  ${x.id.padEnd(5)} bullets=${x.bullets} sub=${x.sub} stats=${x.stats}`);
      console.log("");
    }
  }
  // A frame that lost information relative to Normal is the bug this was written
  // for; make it fail rather than only print.
  const lost = rows.filter((r) => r.key !== "normal" && r.renderablePerScene / base.renderablePerScene < 0.95);
  if (lost.length) {
    console.log(`FAIL — ${lost.map((r) => r.P.label).join(", ")} show less on screen than Normal.\n`);
    process.exit(1);
  }
})();
