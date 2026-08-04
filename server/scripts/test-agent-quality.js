// Phase-1 agent-quality regressions (AGENT-AUDIT-2026-07-28 §5, findings H3/H5/M9/M15).
//
//   scene_role    — a scene the model labelled "benefit" is still a showcase target
//   continuity    — the storyboard cannot describe a different film than the script
//   CD rubric     — weighted, readability-aware, and safe when a dimension is missing
//   CD floor      — a low-scored stock asset is demoted; a low-scored UPLOAD is not
//
// Deterministic: no network, no LLM (the one vision call is stubbed), no writes
// outside a temp dir.
//
//   node scripts/test-agent-quality.js        (npm run test:quality)

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// SANDBOX THE JOB STORE FIRST. This suite calls db.insert(), and db.js captures
// config.paths.dbFile at ITS module load — so without this the test jobs are written
// into the developer's REAL jobs.json and show up in the gallery as failed jobs
// forever. (They did: 10 cdq_* rows.) Repoint config BEFORE anything requires db.
const __TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-cdq-store-"));
const __config = require("../src/config");
__config.paths.dbFile = path.join(__TMP, "jobs.json");
__config.paths.jobsDir = path.join(__TMP, "jobs");
__config.paths.videosDir = path.join(__TMP, "videos");

const { execFileSync } = require("node:child_process");

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

(async () => {
  console.log("\nAgent quality (Phase 1)\n");

  // ------------------------------------------------------------------ scene_role
  const roleMod = require("../src/services/scene_role");
  const { roleOf, coerceRole, showcaseTargets, isShowcase } = roleMod;

  await test("scene_role: the synonyms a model actually writes map to canonical roles", () => {
    const cases = {
      "benefit": "feature", "The Solution": "feature", "demo": "feature", "overview": "feature",
      "the problem": "context", "why it matters": "context", "background": "context",
      "social proof": "proof", "results": "proof", "testimonial": "proof", "the numbers": "proof",
      "how it works": "how", "steps": "how", "walkthrough": "how",
      "sign up": "cta", "closing": "cta", "outro": "cta", "get started": "cta",
      "cold open": "hook", "intro": "hook", "teaser": "hook",
      "quote": "quote",
    };
    for (const [text, want] of Object.entries(cases)) {
      assert.strictEqual(coerceRole(text), want, `"${text}" → expected ${want}, got ${coerceRole(text)}`);
    }
  });

  await test("scene_role: an unlabelled first/last scene still reads as hook/cta", () => {
    assert.strictEqual(roleOf({ purpose: "zzz" }, { index: 0, total: 4 }), "hook");
    assert.strictEqual(roleOf({ purpose: "zzz" }, { index: 3, total: 4 }), "cta");
    assert.strictEqual(roleOf({ purpose: "zzz" }, { index: 1, total: 4 }), "feature");
  });

  await test("scene_role: a 'benefit' scene is a showcase target (it was not before)", () => {
    const script = { scenes: [
      { id: "s1", purpose: "hook" },
      { id: "s2", purpose: "benefit" },        // exact-match code missed this entirely
      { id: "s3", purpose: "social proof" },
      { id: "s4", purpose: "sign up" },
    ] };
    const ids = showcaseTargets(script).map((s) => s.id);
    assert.deepStrictEqual(ids, ["s2", "s3"], `expected the benefit + proof scenes, got ${ids.join(",")}`);
    assert.ok(!isShowcase({ purpose: "sign up" }), "a CTA is not a showcase scene");
  });

  await test("scene_role: normalizeScript stamps a canonical role on every scene", () => {
    const { normalizeScript } = require("../src/services/script");
    const out = normalizeScript({
      title: "t",
      scenes: [
        { id: "s1", start: 0, duration: 3, purpose: "cold open", voiceover: "a", onScreenText: ["A"], visualDirection: "x", musicCue: "up" },
        { id: "s2", start: 3, duration: 3, purpose: "The Solution", voiceover: "b", onScreenText: ["B"], visualDirection: "y", musicCue: "up" },
      ],
      music: { mood: "m", query: "q" }, voice: { style: "s", pace: "p" },
    }, { targetDuration: 6 });
    assert.deepStrictEqual(out.scenes.map((s) => s.role), ["hook", "feature"]);
    assert.strictEqual(out.scenes[1].purpose, "The Solution", "the human-readable label must be preserved for the Script Room");
  });

  // ------------------------------------------------------------------ continuity
  const { reconcileStoryboard } = require("../src/services/continuity");
  const script = { scenes: [
    { id: "s1", start: 0,   duration: 1.5, purpose: "hook",    voiceover: "one",   onScreenText: ["First"] },
    { id: "s2", start: 1.5, duration: 6,   purpose: "feature", voiceover: "two",   onScreenText: ["Second"] },
    { id: "s3", start: 7.5, duration: 4.5, purpose: "cta",     voiceover: "three", onScreenText: ["Third"] },
  ] };

  await test("continuity: storyboard timing that drifted from the script is restored", () => {
    // Exactly what storyboard.normalizeTimeline does: clamp to [2,15] and rescale.
    const drifted = { title: "t", durationSec: 12, scenes: [
      { id: "s1", start: 0, duration: 2,   kind: "hook",   animation: "spring",   headline: "First" },
      { id: "s2", start: 2, duration: 5.6, kind: "bullet", animation: "drift",    headline: "Second" },
      { id: "s3", start: 7.6, duration: 4.4, kind: "cta",  animation: "char-pop", headline: "Third" },
    ] };
    const { storyboard, report } = reconcileStoryboard({ storyboard: drifted, script });
    assert.ok(report.changed && report.retimed >= 2, `expected retiming, got ${JSON.stringify(report)}`);
    assert.deepStrictEqual(storyboard.scenes.map((s) => [s.start, s.duration]),
      [[0, 1.5], [1.5, 6], [7.5, 4.5]], "the approved script's timing must win");
    assert.deepStrictEqual(storyboard.scenes.map((s) => s.kind), ["hook", "bullet", "cta"],
      "the model's creative enrichment must survive");
    assert.strictEqual(storyboard.durationSec, 12);
  });

  await test("continuity: a storyboard with the wrong scene count is made to match", () => {
    const short = { title: "t", durationSec: 12, scenes: [
      { id: "a", start: 0, duration: 6, kind: "hook", animation: "spring", headline: "Only" },
      { id: "b", start: 6, duration: 6, kind: "cta", animation: "drift", headline: "Two" },
    ] };
    const { storyboard, report } = reconcileStoryboard({ storyboard: short, script });
    assert.strictEqual(storyboard.scenes.length, 3, "one scene per APPROVED script scene");
    assert.strictEqual(report.synthesized, 1);
    assert.deepStrictEqual(storyboard.scenes.map((s) => s.id), ["s1", "s2", "s3"]);
    assert.ok(storyboard.scenes[2].headline, "a synthesized scene still carries copy");
  });

  await test("continuity: an already-matching storyboard is reported unchanged", () => {
    const good = { title: "t", durationSec: 12, scenes: script.scenes.map((s) => ({
      id: s.id, start: s.start, duration: s.duration, kind: "bullet", animation: "drift", headline: s.onScreenText[0],
    })) };
    const { report } = reconcileStoryboard({ storyboard: good, script });
    assert.strictEqual(report.changed, false, `expected no-op, got ${JSON.stringify(report)}`);
  });

  await test("continuity: the approved voiceover is never replaced by a paraphrase", () => {
    const paraphrased = { title: "t", durationSec: 12, scenes: script.scenes.map((s) => ({
      id: s.id, start: s.start, duration: s.duration, kind: "bullet", animation: "drift",
      voiceover: "a paraphrase the model invented",
    })) };
    const { storyboard } = reconcileStoryboard({ storyboard: paraphrased, script });
    assert.deepStrictEqual(storyboard.scenes.map((s) => s.voiceover), ["one", "two", "three"]);
  });

  await test("continuity: malformed input is a no-op, never a throw", () => {
    assert.doesNotThrow(() => reconcileStoryboard({}));
    assert.doesNotThrow(() => reconcileStoryboard({ storyboard: null, script }));
    const r = reconcileStoryboard({ storyboard: { scenes: [] }, script: { scenes: [] } });
    assert.ok(r.report.ok);
  });

  // ------------------------------------------------------------------ motion planner
  const { planMotion, verifyMotion, TEXT_ENTERS, CAMERAS } = require("../src/services/motion_planner");
  const sbFor = (roles, dur = 4) => ({
    scenes: roles.map((role, i) => ({
      id: `s${i + 1}`, start: i * dur, duration: dur, role,
      purpose: role, headline: `Line ${i + 1}`, onScreenText: [`Line ${i + 1}`],
    })),
  });

  await test("motion: adjacent scenes never move the same way", () => {
    // Six scenes that all share a role is the worst case — a naive role→motion table
    // would hand every one of them the same entrance, which IS the groundhog defect.
    const plan = planMotion({ storyboard: sbFor(["feature", "feature", "feature", "feature", "feature", "feature"]), seedKey: "job1" });
    const list = Object.values(plan.byScene);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].enter !== list[i - 1].enter || list[i].camera !== list[i - 1].camera,
        `scenes ${i} and ${i + 1} move identically (${list[i].enter}/${list[i].camera})`);
    }
    assert.ok(plan.variety.distinctEnters >= 2);
  });

  await test("motion: every choice is inside the vocabulary the composer implements", () => {
    const plan = planMotion({ storyboard: sbFor(["hook", "context", "feature", "proof", "how", "quote", "cta"]), seedKey: "job2" });
    for (const m of Object.values(plan.byScene)) {
      assert.ok(TEXT_ENTERS.includes(m.enter), `"${m.enter}" is not a mode scene_kit's textIn() implements`);
      assert.ok(CAMERAS.includes(m.camera), `"${m.camera}" is not a camera sceneMotion() implements`);
    }
  });

  await test("motion: duration decides the pacing, not just the role", () => {
    const short = planMotion({ storyboard: sbFor(["feature", "feature"], 2), seedKey: "j" }).byScene.s1;
    const long = planMotion({ storyboard: sbFor(["feature", "feature"], 9), seedKey: "j" }).byScene.s1;
    assert.ok(["char-pop", "slide", "glitch"].includes(short.enter),
      `a 2s scene cannot carry a slow arrival (got ${short.enter})`);
    assert.ok(["drift", "mask-reveal"].includes(long.enter),
      `a 9s scene should breathe (got ${long.enter})`);
    assert.strictEqual(short.emphasisAtSec, null, "a short scene has no room for a mid-scene accent");
    assert.ok(long.emphasisAtSec > long.entranceAtSec, "a long scene earns an emphasis beat after its entrance");
  });

  await test("motion: a hook establishes before its copy lands; timings stay inside the scene", () => {
    const plan = planMotion({ storyboard: sbFor(["hook", "feature", "cta"], 5), seedKey: "j" });
    for (const [i, m] of Object.values(plan.byScene).entries()) {
      const start = i * 5, end = start + 5;
      assert.ok(m.entranceAtSec >= start && m.entranceAtSec < end, `${m.id} entrance outside its window`);
      assert.ok(m.exitAtSec > m.entranceAtSec && m.exitAtSec <= end, `${m.id} exit outside its window`);
    }
    assert.ok(plan.byScene.s1.entranceAtSec > plan.byScene.s2.entranceAtSec - 5,
      "the hook holds a beat before its copy arrives");
  });

  await test("motion: deterministic for a job, varied between jobs", () => {
    const a = planMotion({ storyboard: sbFor(["hook", "feature", "cta"]), seedKey: "same" });
    const b = planMotion({ storyboard: sbFor(["hook", "feature", "cta"]), seedKey: "same" });
    assert.deepStrictEqual(Object.values(a.byScene).map((m) => m.enter), Object.values(b.byScene).map((m) => m.enter),
      "the same job must choreograph identically (renders are memoizable)");
    assert.ok(planMotion({ storyboard: sbFor([]) }) === null, "an empty storyboard yields no plan, not a throw");
  });

  await test("motion verify: names the scene that drifted instead of counting tweens", () => {
    const storyboard = sbFor(["hook", "feature", "cta"]);
    const plan = planMotion({ storyboard, seedKey: "v" });
    const want = Object.values(plan.byScene);
    // s1 honours its plan, s2 renders something else, s3 has no timeline activity at all.
    const html = `
      <script>
      tl.fromTo("#s1",{scale:1},{scale:1.02},0);
      textIn("${want[0].enter}","#s1 .kfw","#s1 .kfc",0.4,0.08);
      tl.fromTo("#s2",{scale:1},{scale:1.02},4);
      textIn("glitch","#s2 .kfw","#s2 .kfc",4.4,0.08);
      </script>`;
    const v = verifyMotion({ plan, indexHtml: html, storyboard });
    assert.strictEqual(v.planAware, true);
    assert.deepStrictEqual(v.staticScenes, ["s3"], "a scene with no tweens must be named");
    assert.ok(v.driftedScenes.includes("s2"), "a scene that ignored its planned entrance must be named");
    assert.ok(!v.driftedScenes.includes("s1"), "an honoured scene must not be flagged");
    assert.ok(v.warnings.some((w) => /no timeline activity/.test(w)));
  });

  await test("motion verify: a composer that owns its choreography is not reported as drift", () => {
    // Native packs (canvas/hf-seek) emit no textIn() — the old tween-count heuristic
    // handed the QA reviewer false "under-animated" concerns for exactly these.
    const storyboard = sbFor(["hook", "feature"]);
    const plan = planMotion({ storyboard, seedKey: "v" });
    const v = verifyMotion({ plan, indexHtml: `<script>tl.to("#s1",{x:1},0); tl.to("#s2",{x:1},4);</script>`, storyboard });
    assert.strictEqual(v.planAware, false);
    assert.strictEqual(v.honored, null, "no verdict is claimed over a composer that never consumed the plan");
    assert.deepStrictEqual(v.driftedScenes, []);
  });

  await test("motion verify: the footgun checks survived the rewrite", () => {
    const v = verifyMotion({ plan: null, indexHtml: `<div style="transform: translateX(10px)"></div><script>tl.to("#a",{repeat:-1});</script>`, storyboard: sbFor(["hook"]) });
    assert.strictEqual(v.footguns.length, 2, "repeat:-1 and the inline transform hidden-state must still be caught");
  });

  // ------------------------------------------------------------------ CD rubric + floor
  const cdMod = require("../src/services/creative_director");
  const openrouter = require("../src/services/openrouter");
  const db = require("../src/db");

  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-cdq-"));
  const jobDir = path.join(TMP, "job");
  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  const imgAbs = path.join(jobDir, "assets", "images", "0.jpg");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=s=1280x720:d=1", "-frames:v", "1", imgAbs]);

  const sceneList = [{ id: "s1", start: 0, duration: 4, purpose: "feature", visualDirection: "the product" }];
  const storyboard = { scenes: sceneList };
  const scriptOne = { scenes: sceneList };

  function stub(scores, extra = {}) {
    openrouter.chat = async ({ user }) => ({
      text: Array.isArray(user)
        ? JSON.stringify({ verdicts: [{ n: 1, decision: "approve", prominence: "hero", assignScene: "s1", sees: "a thing", scores, ...extra }] })
        : "{}",
      tokensIn: 1, tokensOut: 1,
    });
  }
  const realChat = openrouter.chat;

  async function runCD(id, source, scores) {
    db.insert({ id, kind: "project", created_at: Date.now() });
    fs.copyFileSync(imgAbs, imgAbs);   // the file must exist for each run
    const asset = { path: "assets/images/0.jpg", type: "image", source, sceneId: "s1", alt: "a product photo", width: 1280, height: 720, ratio: 1.778 };
    stub(scores);
    const out = await cdMod.reviewAndCurate({
      jobId: id, storyboard, script: scriptOne, subject: "a dev tool", framePack: null,
      assets: [asset], tracker: null, jobDir, orientation: "horizontal",
    });
    return { asset: out.find((a) => a.path === "assets/images/0.jpg"), review: db.get(id).creativeReview };
  }

  const strong = { relevance: 92, readability: 88, visualQuality: 90, storytelling: 85, templateCompat: 84, brandAlignment: 80, motionPotential: 75 };
  const weak = { relevance: 40, readability: 30, visualQuality: 42, storytelling: 35, templateCompat: 38, brandAlignment: 30, motionPotential: 35 };
  const junk = { relevance: 12, readability: 10, visualQuality: 20, storytelling: 8, templateCompat: 15, brandAlignment: 10, motionPotential: 10 };

  await test("CD floor: a strong stock asset keeps its prominence", async () => {
    const { asset } = await runCD("cdq_strong", "pixabay", strong);
    assert.strictEqual(asset.visionOk, true);
    assert.strictEqual(asset.floorPassed, true);
    assert.ok(asset.cdScore >= 80, `expected a high overall, got ${asset.cdScore}`);
  });

  await test("CD floor: a weak stock asset is demoted to background, not placed as hero", async () => {
    const { asset, review } = await runCD("cdq_weak", "pixabay", weak);
    assert.ok(asset, "a demoted asset is kept, not deleted");
    assert.strictEqual(asset.visionOk, false, "must not hold a prominent slot");
    assert.strictEqual(asset.cdProminence, "background");
    assert.strictEqual(asset.__layoutDemoted, true, "the lever scene_kit honors on every pipeline");
    assert.strictEqual(review.qualityFloor.demoted, 1);
  });

  await test("CD floor: junk web stock is rejected outright (when the film isn't left barren)", async () => {
    // TWO assets: rejecting the only asset in a film correctly triggers the
    // never-zero rescue ("a barren film is worse"), so the reject band can only be
    // observed when something else survives — which is the realistic case.
    const id = "cdq_junk2";
    db.insert({ id, kind: "project", created_at: Date.now() });
    const second = path.join(jobDir, "assets", "images", "1.jpg");
    fs.copyFileSync(imgAbs, second);
    openrouter.chat = async ({ user }) => ({
      text: Array.isArray(user) ? JSON.stringify({ verdicts: [
        { n: 1, decision: "approve", prominence: "hero", assignScene: "s1", sees: "good", scores: strong },
        { n: 2, decision: "approve", prominence: "hero", assignScene: "s1", sees: "junk", scores: junk },
      ] }) : "{}",
      tokensIn: 1, tokensOut: 1,
    });
    const out = await cdMod.reviewAndCurate({
      jobId: id, storyboard, script: scriptOne, subject: "a dev tool", framePack: null,
      assets: [
        { path: "assets/images/0.jpg", type: "image", source: "pixabay", sceneId: "s1", alt: "good", width: 1280, height: 720 },
        { path: "assets/images/1.jpg", type: "image", source: "pixabay", sceneId: "s1", alt: "junk", width: 1280, height: 720 },
      ],
      tracker: null, jobDir, orientation: "horizontal",
    });
    const review = db.get(id).creativeReview;
    assert.ok(!out.find((a) => a.path === "assets/images/1.jpg"), "below the reject score, web stock leaves the wire");
    assert.ok(out.find((a) => a.path === "assets/images/0.jpg"), "the strong asset survives");
    assert.strictEqual(review.qualityFloor.rejected, 1);
    assert.ok(/quality floor/i.test(review.rejectedAssets[0].reason), "the rejection must say why");
    fs.copyFileSync(imgAbs, imgAbs);
  });

  await test("CD floor: the USER'S OWN upload is exempt — sovereignty beats the floor", async () => {
    const { asset } = await runCD("cdq_upload", "upload", junk);
    assert.ok(asset, "an upload is never deleted");
    assert.notStrictEqual(asset.cdProminence, "reject");
    assert.notStrictEqual(asset.__layoutDemoted, true, "the user's own material is the film's subject");
  });

  await test("CD rubric: a missing dimension is inherited, not scored zero", async () => {
    // A terse model answers 3 of 7 dimensions. With naive zero-filling the overall
    // would be ~38 and the floor would demote a genuinely strong asset.
    const { asset } = await runCD("cdq_terse", "pixabay", { relevance: 90, visualQuality: 88, storytelling: 86 });
    assert.ok(asset.cdScore >= 80, `terse-but-strong scored ${asset.cdScore} — a missing dimension was read as 0`);
    assert.strictEqual(asset.visionOk, true);
  });

  await test("CD rubric: readability is weighted — an unreadable image loses to a readable one", async () => {
    const a = await runCD("cdq_read_hi", "pixabay", { relevance: 80, readability: 90, visualQuality: 80, storytelling: 70, templateCompat: 70, brandAlignment: 70, motionPotential: 70 });
    const b = await runCD("cdq_read_lo", "pixabay", { relevance: 80, readability: 10, visualQuality: 80, storytelling: 70, templateCompat: 70, brandAlignment: 70, motionPotential: 70 });
    assert.ok(a.asset.cdScore > b.asset.cdScore + 10,
      `readability must move the score materially (got ${a.asset.cdScore} vs ${b.asset.cdScore})`);
  });

  await test("CD rubric: a legacy brandCompat reply still scores as template fit", async () => {
    const { asset } = await runCD("cdq_legacy", "pixabay", { relevance: 90, visualQuality: 85, brandCompat: 80, storytelling: 80, motionPotential: 70, templateCompat: 82 });
    assert.ok(asset.cdScore >= 75, `a pre-rubric reply must not collapse (got ${asset.cdScore})`);
  });

  // ------------------------------------------- CD → Audio Director handoff (M7)
  const { defaultAudioPlan, directAudio } = require("../src/services/audio_director");
  const digest = [
    { id: "s1", kind: "hook", startSec: 0, endSec: 4, animation: "", beats: [], voPresent: true, voWords: 9 },
    { id: "s2", kind: "cta",  startSec: 4, endSec: 8, animation: "", beats: [], voPresent: true, voWords: 7 },
  ];
  const cues = [{ id: 0, name: "whoosh", startSec: 1 }, { id: 1, name: "impact", startSec: 5 }];

  await test("audio: with no creative direction the plan is unchanged (no regression)", () => {
    const plan = defaultAudioPlan(digest, cues, 8);
    assert.strictEqual(plan.scenes[1].musicGainDb, 2, "a CTA still lifts the music");
    assert.ok(plan.sfx.every((x) => x.accept), "every cue is still accepted");
    assert.strictEqual(plan.creativeDirection, undefined, "nothing is claimed when nothing was said");
  });

  await test("audio: a music bed the director rejected is capped under the voiceover", async () => {
    const plan = await directAudio({
      jobId: null, storyboard: { scenes: digest.map((d) => ({ id: d.id, start: d.startSec, duration: d.endSec - d.startSec, kind: d.kind })) },
      script: { scenes: [] }, voClips: [{ sceneId: "s1", startSec: 0, durationSec: 3, text: "hi there" }],
      sfxClips: cues.map((c) => ({ name: c.name, startSec: c.startSec })), musicPath: "/tmp/music.mp3",
      brief: null, subject: "a dev tool", durationSec: 8, tracker: null,
      musicAdvice: { keep: false, classification: "corporate", fitScore: 30, suggestedQuery: "warm acoustic indie", note: "too corporate for the tone" },
      sfxAdvice: { recommend: ["entry"], reject: ["impact"] },
    });
    assert.ok(plan.scenes.every((s) => s.musicGainDb <= -3),
      `a misfit bed must never lead a scene, got ${plan.scenes.map((s) => s.musicGainDb).join(",")}`);
    const impact = plan.sfx.find((x) => x.cue === "impact");
    assert.strictEqual(impact.accept, false, "a cue the director rejected must not reach the mix");
    assert.strictEqual(plan.sfx.find((x) => x.cue === "whoosh").accept, true, "unrejected cues are untouched");
    assert.strictEqual(plan.creativeDirection.suggestedQuery, "warm acoustic indie",
      "the better query the director wanted is disclosed, since we cannot refetch this late");
  });

  await test("audio: the advice is idempotent (applying it twice cannot double-count)", () => {
    const { __test } = require("../src/services/audio_director");
    const advice = { musicFits: false, rejected: new Set(["impact"]), recommend: [], musicNote: null, musicClassification: null, musicFitScore: null, suggestedQuery: null };
    const once = __test.applyAdvice(defaultAudioPlan(digest, cues, 8), advice);
    const twice = __test.applyAdvice(__test.applyAdvice(defaultAudioPlan(digest, cues, 8), advice), advice);
    assert.deepStrictEqual(once.scenes.map((s) => s.musicGainDb), twice.scenes.map((s) => s.musicGainDb));
  });

  await test("audio: the director's verdict reaches the plan through reviewAndCurate's onReview", async () => {
    const id = "cdq_advice";
    db.insert({ id, kind: "project", created_at: Date.now() });
    fs.copyFileSync(imgAbs, imgAbs);
    let captured = null;
    openrouter.chat = async ({ user }) => ({
      text: Array.isArray(user)
        ? JSON.stringify({ verdicts: [{ n: 1, decision: "approve", prominence: "hero", assignScene: "s1", sees: "ok", scores: strong }] })
        // the advisory audio call (user is a string) — this is the payload that used to dead-end
        : JSON.stringify({ musicAnalysis: { keep: false, classification: "corporate", fitScore: 22, suggestedQuery: "lo-fi beat", note: "wrong energy" }, soundEffectAnalysis: { recommend: [], reject: ["impact"] } }),
      tokensIn: 1, tokensOut: 1,
    });
    await cdMod.reviewAndCurate({
      jobId: id, storyboard,
      // reviewAudio only runs when there is a soundtrack to judge — a script with no
      // music block and no sfx cues short-circuits to an empty verdict by design.
      script: { ...scriptOne, music: { mood: "corporate", query: "corporate uplifting" } },
      subject: "a dev tool", framePack: null,
      assets: [{ path: "assets/images/0.jpg", type: "image", source: "pixabay", sceneId: "s1", alt: "x", width: 1280, height: 720 }],
      tracker: null, jobDir, orientation: "horizontal",
      onReview: (r) => { captured = { music: r.musicAnalysis, sfx: r.soundEffectAnalysis }; },
    });
    assert.ok(captured && captured.music, "onReview must deliver the audio verdict");
    assert.strictEqual(captured.music.keep, false);
    assert.deepStrictEqual(captured.sfx.reject, ["impact"]);
  });

  openrouter.chat = realChat;
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
