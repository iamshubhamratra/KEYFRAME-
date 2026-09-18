// CONTENT DENSITY — the second information channel.
//
// What these lock, in one sentence each:
//
//   - a frame never gets copy the voice already spoke
//   - a long fact is CONDENSED, never truncated mid-word
//   - the best facts do not all land on scene 1
//   - every line the director writes is readable in its own scene
//   - a film with no brief, no script or no storyboard still renders
//
// The regression that motivated the module is measured directly by the last
// block: a very-fast storyboard that arrives headline-only must come out of
// directDensity() with a real frame on every scene.

const assert = require("node:assert");
const CD = require("../src/services/content_density");
const P = require("../src/services/pacing");

let failures = 0;
function t(name, fn) {
  try { fn(); console.log(`  ok    ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const { classify, echoes, meaty, splitClauses } = CD._internals;

// A brief with the shape the real ones have: a few messages, a few hard facts,
// numbers living inside prose.
const BRIEF = {
  subject: "Tully",
  improvedPrompt: "Tully files receipts automatically for small businesses. Trusted by 12k teams.",
  goal: "Leave the viewer eager to start a free trial",
  audience: "small business owners",
  keyMessages: [
    "Tully files every receipt automatically the moment you photograph it",
    "Categories, VAT and totals are extracted with no manual entry",
    "Exports are HMRC-compliant and tax-ready in seconds",
  ],
  mustIncludeFacts: [
    "Saves 6 hours a month on bookkeeping",
    "99.4% extraction accuracy",
    "Free for 30 days, no card needed",
  ],
};

const SCRIPT = {
  scenes: [
    { id: "s1", duration: 2.3, purpose: "hook", voiceover: "Drowning in receipts?", onScreenText: ["Receipts everywhere?"] },
    { id: "s2", duration: 2.3, purpose: "how", voiceover: "Snap one photo.", onScreenText: ["Snap once."] },
    { id: "s3", duration: 2.3, purpose: "proof", voiceover: "", onScreenText: ["Tax-ready"] },
    { id: "s4", duration: 2.3, purpose: "cta", voiceover: "Try Tully today.", onScreenText: ["Try Tully"] },
  ],
};

// The measured failure shape: every scene arrives headline-only.
function thinStoryboard() {
  return {
    durationSec: 9.2,
    scenes: SCRIPT.scenes.map((s) => ({
      id: s.id, duration: s.duration, kind: s.purpose, purpose: s.purpose,
      headline: s.onScreenText[0], subtext: "", bullets: [], kicker: "", emphasis: "",
      voiceover: s.voiceover,
    })),
  };
}

console.log("\ncontent density — classification and text hygiene");

t("classify separates a metric, a label, a callout and a fact", () => {
  assert.equal(classify("99.4% accuracy"), "metric");
  assert.equal(classify("Receipt scanning"), "keyword");
  assert.equal(classify("Exports are tax-ready in seconds"), "callout");
  assert.equal(classify("Tully files every receipt automatically the moment you photograph it"), "fact");
  assert.equal(classify("Try Tully today"), "cta");
});

t("meaty rejects filler and keeps anything with a number", () => {
  assert.equal(meaty("Yes."), false);
  assert.equal(meaty("Wow"), false);
  assert.equal(meaty("6 hrs"), true);
  assert.equal(meaty("Receipt scanning"), true);
  assert.equal(meaty(""), false);
});

t("echoes catches a restatement, not two different facts", () => {
  assert.equal(echoes("Tax-ready in seconds", "Tax-ready in seconds"), true);
  assert.equal(echoes("Tax ready", "Tax-ready in seconds"), true, "substring");
  assert.equal(echoes("99.4% accuracy", "Free for 30 days"), false);
});

t("splitClauses yields standalone fragments, never comma scraps", () => {
  const out = splitClauses("Snap one photo. Tully files it — instantly.");
  assert.ok(out.length >= 2, "splits on sentences and dashes");
  assert.ok(out.every((s) => s.split(/\s+/).length >= 2), "every fragment stands alone");
  assert.deepEqual(splitClauses(""), []);
});

console.log("\ncontent density — condensation never truncates mid-word");

t("a long fact is shortened to whole words at every mode's bullet width", () => {
  const long = "LangGraph orchestrates reliable multi-step agents as directed graphs";
  for (const m of ["relaxed", "normal", "fast", "very-fast"]) {
    const p = P.resolve(m, { durationSec: 90 });
    const cap = P.visualCapacity(p, p.scene.targetSec);
    for (const width of Object.values(cap.roles)) {
      const out = CD._internals ? require("../src/services/content_density") : null;
      const line = P.fitVisualLine(long, p.scene.targetSec, "bullet", p);
      if (line) {
        assert.ok(long.startsWith(line), `${m}: "${line}" must be a whole-word prefix`);
        assert.ok(!/\s$/.test(line), `${m}: no trailing space`);
      }
      assert.ok(width > 0, "every role has a width");
      void out;
    }
  }
});

t("keyphrases turns one sentence into several real labels", () => {
  const phrases = CD.buildContentPool({ brief: BRIEF }).length;
  assert.ok(phrases > 0, "pool builds");
  // The list inside a fact becomes labels rather than a truncated sentence.
  const sb = { durationSec: 2.3, scenes: [{ id: "x", duration: 2.3, headline: "No manual entry", bullets: [], subtext: "", voiceover: "" }] };
  CD.directDensity({ brief: BRIEF, script: { scenes: [] }, storyboard: sb, pacing: P.resolve("very-fast", { durationSec: 90 }) });
  const all = [sb.scenes[0].subtext, ...(sb.scenes[0].bullets || [])].filter(Boolean);
  assert.ok(all.length >= 1, "the frame gained copy");
  for (const line of all) {
    assert.ok(!/\b\w{1,3}$/.test(line) || /\d/.test(line) || line.split(" ").length >= 2,
      `"${line}" must not end in a chopped word`);
  }
});

console.log("\ncontent density — the frame never repeats the voice");

t("no added line restates its own scene's headline or narration", () => {
  const sb = thinStoryboard();
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("very-fast", { durationSec: 90 }) });
  for (const s of sb.scenes) {
    const added = [s.subtext, ...(s.bullets || [])].filter(Boolean);
    for (const line of added) {
      assert.ok(!echoes(line, s.headline), `scene ${s.id}: "${line}" echoes the headline "${s.headline}"`);
      if (s.voiceover) {
        assert.ok(!echoes(line, s.voiceover), `scene ${s.id}: "${line}" echoes the VO "${s.voiceover}"`);
      }
    }
  }
});

t("one scene's narration never lands on a different scene's frame", () => {
  const sb = thinStoryboard();
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("very-fast", { durationSec: 90 }) });
  const vos = SCRIPT.scenes.filter((s) => s.voiceover).map((s) => ({ id: s.id, vo: s.voiceover }));
  for (const s of sb.scenes) {
    for (const line of [s.subtext, ...(s.bullets || [])].filter(Boolean)) {
      for (const v of vos) {
        if (v.id === s.id) continue;
        assert.ok(!echoes(line, v.vo), `scene ${s.id} shows "${line}", which is scene ${v.id}'s spoken line`);
      }
    }
  }
});

t("the same line is never shown twice in one film", () => {
  const sb = thinStoryboard();
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("fast", { durationSec: 60 }) });
  const seen = new Set();
  for (const s of sb.scenes) {
    for (const line of [s.subtext, ...(s.bullets || [])].filter(Boolean)) {
      const k = line.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      assert.ok(!seen.has(k), `"${line}" appears on more than one frame`);
      seen.add(k);
    }
  }
});

console.log("\ncontent density — allocation is fair, not front-loaded");

t("the film's facts are spread across frames, not stacked on scene 1", () => {
  const sb = thinStoryboard();
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("very-fast", { durationSec: 90 }) });
  const per = sb.scenes.map((s) => [s.subtext, ...(s.bullets || [])].filter(Boolean).length);
  const total = per.reduce((a, b) => a + b, 0);
  assert.ok(total > 0, "something was added");
  assert.ok(per[0] <= Math.ceil(total * 0.6),
    `scene 1 took ${per[0]} of ${total} elements — front-loaded`);
  assert.ok(per.filter((n) => n > 0).length >= 2, "more than one frame was helped");
});

t("brief.goal is never printed on screen", () => {
  const sb = thinStoryboard();
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("fast", { durationSec: 60 }) });
  for (const s of sb.scenes) {
    for (const line of [s.subtext, ...(s.bullets || [])].filter(Boolean)) {
      assert.ok(!/leave the viewer/i.test(line), `"${line}" is the brief's objective, not screen copy`);
    }
  }
});

t("adjacent frames never carry the same kicker chip", () => {
  const sb = thinStoryboard();
  sb.scenes.forEach((s) => { s.purpose = "feature"; s.kind = "feature"; });
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("fast", { durationSec: 60 }) });
  for (let i = 1; i < sb.scenes.length; i++) {
    const a = (sb.scenes[i - 1].kicker || "").toLowerCase();
    const b = (sb.scenes[i].kicker || "").toLowerCase();
    if (a && b) assert.notEqual(a, b, `scenes ${i} and ${i + 1} both show "${b}"`);
  }
});

console.log("\ncontent density — readability is never traded for density");

t("every line the director adds fits its own scene's readable floor", () => {
  for (const m of ["relaxed", "normal", "fast", "very-fast"]) {
    const p = P.resolve(m, { durationSec: 90 });
    const sb = thinStoryboard();
    CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: p });
    for (const s of sb.scenes) {
      const lines = [s.kicker, s.headline, s.subtext, ...(s.bullets || [])].filter(Boolean);
      const check = P.checkReadability(lines, s.duration);
      assert.ok(check.ok, `${m} scene ${s.id}: needs ${check.need}s, has ${check.have}s`);
    }
  }
});

t("the reveal plan keeps the last element readable before the cut", () => {
  const p = P.resolve("very-fast", { durationSec: 90 });
  const els = [
    { role: "kicker", text: "STEP 02" },
    { role: "headline", text: "No manual entry" },
    { role: "subtext", text: "99.4% accuracy" },
  ];
  const plan = CD.planReveal(els, 4.0, p);
  const last = plan[plan.length - 1];
  assert.ok(last.at + P.minReadableSec(last.text) <= 4.0 + 1e-9,
    `last element enters at ${last.at}s and needs ${P.minReadableSec(last.text)}s of a 4s scene`);
  assert.ok(plan.every((e) => e.at >= 0));
});

t("a stagger is either visible or not applied at all", () => {
  // The contract: no offsets, or offsets far enough apart to read as a reveal.
  // A 0.02s "stagger" is a rounding error that tells a composer it is
  // choreographing something when every element lands in the same frame.
  const p = P.resolve("very-fast", { durationSec: 90 });
  for (const n of [2, 3, 5, 7, 12, 20]) {
    for (const sec of [2.0, 2.3, 3.5, 6.0]) {
      const els = Array.from({ length: n }, (_, i) => ({ role: "bullet", text: `Label number ${i}` }));
      const plan = CD.planReveal(els, sec, p);
      const steps = plan.slice(1).map((e, i) => Math.round((e.at - plan[i].at) * 1000) / 1000);
      const allZero = plan.every((e) => e.at === 0);
      assert.ok(allZero || steps.every((s) => s >= 0.08),
        `${n} elements in ${sec}s produced an invisible ${Math.min(...steps)}s stagger`);
    }
  }
});

t("a scene with no room to stagger enters as one frame", () => {
  const p = P.resolve("very-fast", { durationSec: 90 });
  // Elements long enough that reading the last one consumes the whole scene.
  const els = Array.from({ length: 6 }, (_, i) => ({ role: "bullet", text: `A considerably longer label ${i}` }));
  const plan = CD.planReveal(els, 2.0, p);
  assert.ok(plan.every((e) => e.at === 0), "no room left for a reveal, so nothing is staggered");
});

t("a faster mode reveals quicker than a slower one", () => {
  const els = [
    { role: "kicker", text: "WHY" }, { role: "headline", text: "One workspace" },
    { role: "subtext", text: "Teams ship together" },
  ];
  const slow = CD.planReveal(els, 6, P.resolve("relaxed", { durationSec: 60 }));
  const fast = CD.planReveal(els, 6, P.resolve("very-fast", { durationSec: 60 }));
  assert.ok(fast[fast.length - 1].at <= slow[slow.length - 1].at,
    `very-fast (${fast[2].at}s) must not reveal slower than relaxed (${slow[2].at}s)`);
});

console.log("\ncontent density — it can never break a render");

t("missing brief, script or storyboard is survivable", () => {
  assert.doesNotThrow(() => CD.directDensity({}));
  assert.doesNotThrow(() => CD.directDensity({ storyboard: null }));
  assert.doesNotThrow(() => CD.directDensity({ storyboard: { scenes: [] } }));
  const sb = thinStoryboard();
  assert.doesNotThrow(() => CD.directDensity({ storyboard: sb }));
  assert.doesNotThrow(() => CD.directDensity({ brief: null, script: null, storyboard: thinStoryboard() }));
  assert.doesNotThrow(() => CD.buildContentPool({}));
});

t("authored copy is never overwritten or reordered", () => {
  const sb = thinStoryboard();
  sb.scenes[1].subtext = "An authored support line";
  sb.scenes[1].bullets = ["Authored A", "Authored B"];
  sb.scenes[1].kicker = "AUTHORED";
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("fast", { durationSec: 60 }) });
  assert.equal(sb.scenes[1].subtext, "An authored support line", "a filled slot is untouched");
  assert.equal(sb.scenes[1].kicker, "AUTHORED");
  // The row may be TOPPED UP (that is the density fix), but the author's labels
  // must survive, in their own order, at the front.
  assert.deepEqual(sb.scenes[1].bullets.slice(0, 2), ["Authored A", "Authored B"]);
});

t("a typewriter scene never gets marketing copy typed as a shell command", () => {
  const sb = thinStoryboard();
  sb.scenes[1].animation = "typewriter";
  sb.scenes[1].headline = "$ npm install tully";
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("very-fast", { durationSec: 90 }) });
  assert.equal(sb.scenes[1].subtext, "", "subtext is TYPED as a command line — leave it alone");
  assert.deepEqual(sb.scenes[1].bullets, [], "bullets are TYPED as command lines — leave them alone");
  assert.ok(sb.scenes[0].subtext || (sb.scenes[0].bullets || []).length,
    "the carve-out is scene-local, not film-wide");
});

t("a partly-filled label row is topped up, not left short", () => {
  // One scene against the whole pool, so the assertion is about the TOP-UP rule
  // rather than about how much material a three-fact brief has to go round.
  const sb = {
    durationSec: 2.3,
    scenes: [{ id: "s1", duration: 2.3, kind: "feature", purpose: "feature",
      headline: "No manual entry", subtext: "", bullets: ["Authored A"], kicker: "", emphasis: "", voiceover: "" }],
  };
  CD.directDensity({ brief: BRIEF, script: { scenes: [] }, storyboard: sb, pacing: P.resolve("very-fast", { durationSec: 90 }) });
  const row = sb.scenes[0].bullets;
  assert.equal(row[0], "Authored A", "the authored label survives and leads");
  assert.ok(row.length >= 2, `a one-label row must be completed, got ${JSON.stringify(row)}`);
});

t("reveal offsets are re-planned against the film's final scene lengths", () => {
  // retimeScenesToVo only ever GROWS a scene, so a plan made in the text-director
  // node is laid out against a duration the delivered film no longer has.
  const sb = thinStoryboard();
  const p = P.resolve("very-fast", { durationSec: 90 });
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: p });
  const before = (sb.scenes[0].textReveal || []).map((e) => e.at);
  // The retime: every scene gains a second of measured narration.
  sb.scenes.forEach((s) => { s.duration = s.duration + 1.0; });
  CD.replanReveal(sb, p);
  const after = (sb.scenes[0].textReveal || []).map((e) => e.at);
  assert.equal(after.length, before.length, "the same elements are still planned");
  if (before.length > 1) {
    assert.ok(after[after.length - 1] >= before[before.length - 1],
      `a longer scene must not reveal SOONER (${after[after.length - 1]} vs ${before[before.length - 1]})`);
  }
  // Copy is untouched — the narration was recorded against it.
  assert.ok(sb.scenes[0].headline, "copy survives a replan");
  assert.doesNotThrow(() => CD.replanReveal(null));
  assert.doesNotThrow(() => CD.replanReveal({ scenes: [] }));
});

t("the reveal plan is non-enumerable so it cannot leak into a prompt", () => {
  const sb = thinStoryboard();
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("fast", { durationSec: 60 }) });
  const s = sb.scenes[0];
  assert.ok(Array.isArray(s.textReveal), "the plan is attached");
  assert.ok(!Object.keys(s).includes("textReveal"), "but never enumerable");
  assert.ok(!JSON.stringify(s).includes("textReveal"), "and never serialized into a prompt");
});

console.log("\ncontent density — THE REGRESSION: a headline-only very-fast film");

t("every frame of a headline-only film gains real copy", () => {
  const sb = thinStoryboard();
  const before = CD.frameStats(sb);
  assert.equal(before.elementsPerScene, 1, "the measured failure shape: one element a frame");
  assert.equal(before.framesWithOneElement, sb.scenes.length);

  const { report } = CD.directDensity({
    brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("very-fast", { durationSec: 90 }),
  });
  assert.ok(report.after.elementsPerScene > before.elementsPerScene,
    `frames must gain elements (${before.elementsPerScene} -> ${report.after.elementsPerScene})`);
  assert.ok(report.after.charsPerScene > before.charsPerScene,
    `frames must gain copy (${before.charsPerScene} -> ${report.after.charsPerScene})`);
  assert.equal(report.after.framesWithOneElement, 0, "no frame is left with a single line");
});

t("the must-include facts actually reach the screen", () => {
  const sb = thinStoryboard();
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: sb, pacing: P.resolve("very-fast", { durationSec: 90 }) });
  const shown = sb.scenes.flatMap((s) => [s.subtext, ...(s.bullets || [])]).filter(Boolean).join(" | ").toLowerCase();
  const hits = BRIEF.mustIncludeFacts.filter((f) => {
    const head = f.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 3)[0];
    return head && shown.includes(head);
  });
  assert.ok(hits.length >= 1,
    `none of the must-include facts reached the frame. Shown: ${shown}`);
});

t("a denser mode puts MORE on each frame than the default", () => {
  const mk = () => thinStoryboard();
  const normal = mk(), veryFast = mk();
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: normal, pacing: P.resolve("normal", { durationSec: 60 }) });
  CD.directDensity({ brief: BRIEF, script: SCRIPT, storyboard: veryFast, pacing: P.resolve("very-fast", { durationSec: 90 }) });
  const a = CD.frameStats(normal), b = CD.frameStats(veryFast);
  assert.ok(b.elementsPerScene >= a.elementsPerScene,
    `very-fast (${b.elementsPerScene}) must not be thinner than normal (${a.elementsPerScene})`);
});

console.log(`\n${failures ? `${failures} FAILURE(S)` : "all content-density checks passed"}\n`);
process.exit(failures ? 1 : 0);
