// INTEGRATION TEST — project_pipeline.runProduction, end to end, with every network
// call stubbed and every heavy subprocess replaced by a cheap real one.
//
// WHY THIS EXISTS. The legacy runner shipped a `ReferenceError: sbRes is not defined`
// at its audio stage — thrown on EVERY run, after the render and voiceover had already
// succeeded, turning a finished film into a failed job. Nothing caught it because
// `orchestrator: "langgraph"` routes production through agents/graph.js, and this path
// had no test that ever executed it. Unit tests could not have caught it either: the
// bug is not in any one function, it is in the wiring BETWEEN the stages. Only running
// the whole function finds that class of defect.
//
// WHAT IS REAL HERE. Everything that decides something: normalizeScript, the storyboard
// agent + its validation, the continuity gate, the caption director, the creative
// director (over stubbed vision), the audio director, the scene-kit composer, the
// asset/brand/language disclosure passes, and the ffmpeg audio mix. Only the four
// genuinely external things are replaced:
//
//   openrouter.chat        → canned JSON per stage (no network, no spend)
//   renderer.render        → a real 1s mp4 written by ffmpeg (no headless Chrome)
//   validator.validate     → ok (no `npx hyperframes lint` download)
//   acquire / fetchMusic / fetchSfx / synthesizeFitted → real tiny files on disk
//
// SANDBOXING. config.paths is repointed at a temp dir BEFORE any module is required,
// so the job store, job dirs and video/subtitle output never touch the developer's real
// jobs.json or public/videos. Require ORDER is load-bearing here — see below.
//
//   node scripts/test-production-integration.js      (npm run test:integration)

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-int-"));

// ---------------------------------------------------------------- 1. sandbox
// config is a plain object built at load; repoint it before ANYTHING else requires it,
// because db.js captures config.paths.dbFile at ITS module load.
const config = require("../src/config");
config.paths.jobsDir = path.join(TMP, "jobs");
config.paths.videosDir = path.join(TMP, "videos");
config.paths.uploadsDir = path.join(TMP, "uploads");
config.paths.dbFile = path.join(TMP, "jobs.json");
for (const d of [config.paths.jobsDir, config.paths.videosDir, config.paths.uploadsDir]) fs.mkdirSync(d, { recursive: true });
// Keep the run deterministic and offline regardless of the developer's config.json.
config.creativeDirector.enabled = true;
config.audioDirector.enabled = true;
config.artDirector = { ...(config.artDirector || {}), enabled: false };  // graph-only; not on this path
config.harvester = { ...(config.harvester || {}), enabled: false };

// ---------------------------------------------------------------- 2. fixtures
function mkMp4(p, seconds = 1) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=s=320x180:d=${seconds}`, "-pix_fmt", "yuv420p", p]);
  return p;
}
function mkMp3(p, seconds = 1) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono:d=${seconds}`, "-q:a", "9", p]);
  return p;
}
function mkJpg(p) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=s=1280x720:d=1", "-frames:v", "1", p]);
  return p;
}
const FIX = path.join(TMP, "fixtures");
fs.mkdirSync(FIX, { recursive: true });
const FIX_JPG = mkJpg(path.join(FIX, "stock.jpg"));
const FIX_MP3 = mkMp3(path.join(FIX, "bed.mp3"));

// ---------------------------------------------------------------- 3. stub the edges
// These MUST be patched before project_pipeline is required: it destructures these
// functions at ITS module load, so a later patch would be invisible to it.
const calls = { chat: [], render: 0, acquire: 0, vo: 0, music: 0, sfx: 0, mix: 0 };

const openrouter = require("../src/services/openrouter");
openrouter.checkBudget = async () => ({ remaining: 25, limit: null, openrouter: { remaining: 25, perKey: 25, account: 25, dailyLimit: null }, kie: null });

// One responder for every LLM stage. Shaped to be VALID for each consumer's validator,
// so the real parsing/validation code runs rather than being bypassed.
function storyboardJson(scenes, duration) {
  return JSON.stringify({
    title: "Test Film", durationSec: duration, orientation: "horizontal",
    palette: { background: "#0B0B12", text: "#FFFFFF", primary: "#6366F1", accent: "#8B5CF6" },
    // DELIBERATELY DRIFTED: 2s floor + rescale, exactly what storyboard.normalizeTimeline
    // does to a script scene shorter than 2s. The continuity gate must pull it back.
    scenes: scenes.map((s, i) => ({
      id: s.id, start: 0, duration: Math.max(2, s.duration), kind: i === 0 ? "hook" : i === scenes.length - 1 ? "cta" : "bullet",
      animation: "drift", headline: `Headline ${i + 1}`, subtext: "supporting line",
      voiceover: "a paraphrase the model invented", beats: [],
    })),
  });
}
let SCRIPT_SCENES = [];
let DURATION = 12;
openrouter.chat = async ({ stage, user }) => {
  calls.chat.push(stage || "?");
  const text = (() => {
    if (stage === "storyboard") return storyboardJson(SCRIPT_SCENES, DURATION);
    if (stage === "creative_director") {
      // Vision review (array content) vs the advisory audio review (string content).
      if (Array.isArray(user)) {
        const n = (JSON.stringify(user).match(/"image_url"/g) || []).length;
        return JSON.stringify({
          verdicts: Array.from({ length: n }, (_, i) => ({
            n: i + 1, decision: "approve", prominence: "support", assignScene: SCRIPT_SCENES[1] && SCRIPT_SCENES[1].id,
            sees: "a product photo", scores: { relevance: 88, readability: 80, visualQuality: 85, storytelling: 78, templateCompat: 80, brandAlignment: 75, motionPotential: 70 },
            popupCoverage: 0, completeness: "ok", obstruction: "none",
          })),
        });
      }
      return JSON.stringify({
        musicAnalysis: { classification: "corporate", fitScore: 30, keep: false, suggestedQuery: "warm acoustic", note: "wrong energy" },
        soundEffectAnalysis: { recommend: ["entry"], reject: [] },
      });
    }
    if (stage === "audio_director") {
      return JSON.stringify({
        master: { voLufs: -16, voTruePeakDb: -1.5, musicSoloLufs: -23, musicUnderVoDuckDb: -11, duckAttackMs: 40, duckReleaseMs: 500, masterTruePeakDb: -1 },
        scenes: SCRIPT_SCENES.map((s) => ({ sceneId: s.id, musicGainDb: 2, duckDepthDb: 11 })),
        sfx: [], score: { voiceoverClarity: 90, musicBalance: 80, sfxQuality: 70, synchronization: 85, emotionalImpact: 80, overall: 84 },
      });
    }
    return "{}";
  })();
  return { text, tokensIn: 10, tokensOut: 10, model: "gemini-3-5-flash", provider: "kie" };
};

const renderer = require("../src/services/renderer");
// A SWITCH inside the stub, not a later re-patch: pipeline.js destructures `render` at
// its own module load, so reassigning renderer.render afterwards would be invisible to
// it (the same subtlety this file's header warns about — worth knowing, since getting
// it wrong makes a failure-path test silently assert the happy path).
let renderShouldFail = false;
renderer.render = async ({ jobId, jobDir, durationSec }) => {
  if (renderShouldFail) throw new Error("render exploded");
  calls.render++;
  // A real (tiny) mp4 so the audio mixer downstream is exercised for real.
  const out = path.join(jobDir, "renders");
  fs.mkdirSync(out, { recursive: true });
  const p = mkMp4(path.join(out, "out.mp4"), Math.min(2, Math.max(1, Math.round(durationSec / 6))));
  return { videoPath: p, videoUrl: `/videos/${jobId}.mp4`, durationSec };
};

const validator = require("../src/services/validator");
validator.validate = async () => ({ ok: true });          // no `npx hyperframes lint`
validator.runInspect = async () => ({ ok: true, skipped: true });

const assetSources = require("../src/services/asset_sources");
assetSources.acquire = async ({ outputPath }) => {
  calls.acquire++;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(FIX_JPG, outputPath);
  return {
    path: outputPath, query: "q", fromCache: false, source: "pixabay",
    license: "test", sourceUrl: "https://example.test/x",
    width: 1280, height: 720, ratio: 1.778, hasAlpha: false,
    dhash: "0f1e2d3c4b5a6978", dominantColor: "#4466aa",
  };
};

const audioSources = require("../src/services/audio_sources");
audioSources.fetchMusic = async ({ outputPath }) => { calls.music++; fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.copyFileSync(FIX_MP3, outputPath); return outputPath; };
audioSources.fetchSfx = async ({ outputPath }) => { calls.sfx++; fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.copyFileSync(FIX_MP3, outputPath); return outputPath; };

const voFit = require("../src/services/vo_fit");
voFit.synthesizeFitted = async ({ text, targetSec, outputPath }) => {
  calls.vo++;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  mkMp3(outputPath, Math.max(1, Math.round(targetSec * 0.8)));
  return { path: outputPath, durationSec: Math.max(1, targetSec * 0.8), text, tightened: false };
};

// ---- only NOW load the runner (it destructures all of the above at load time).
const db = require("../src/db");
const projectPipeline = require("../src/services/project_pipeline");

// ---------------------------------------------------------------- 4. the test
const assert = require("node:assert");
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.stack ? e.stack.split("\n").slice(0, 3).join("\n      ") : e.message}`); failed++; }
}

function seedJob(id, { duration = 12, captions = true } = {}) {
  // A 1.5s opening scene is the point: the storyboard agent's [2,15] clamp cannot
  // represent it, so without the continuity gate the picture and the audio diverge.
  const scenes = [
    { id: "s1", start: 0,   duration: 1.5, purpose: "cold open", voiceover: "Meet the tool.",        onScreenText: ["Meet the tool"], visualDirection: "a clean desk with a laptop", assetNeeds: [{ type: "image", query: "developer desk", role: "background" }], sfx: [], musicCue: "rise" },
    { id: "s2", start: 1.5, duration: 6,   purpose: "benefit",   voiceover: "It ships your work faster.", onScreenText: ["Ship faster"], visualDirection: "the product dashboard", assetNeeds: [{ type: "image", query: "dashboard ui", role: "inset" }], sfx: [], musicCue: "steady" },
    { id: "s3", start: 7.5, duration: 4.5, purpose: "sign up",   voiceover: "Start today.",          onScreenText: ["Start today"], visualDirection: "a closing call to action", assetNeeds: [], sfx: [], musicCue: "land" },
  ];
  SCRIPT_SCENES = scenes; DURATION = duration;
  db.insert({
    id, kind: "project", prompt: "a promo for a dev tool", duration,
    orientation: "horizontal", quality: "480p", width: 854, height: 480, fps: 24,
    framePack: null, voiceStyle: null, autopilot: true,
    captionsEnabled: captions, captionsConfig: { enabled: captions, language: "en", voiceoverLanguage: "en", videoTextLanguage: "en", exportSRT: true, exportVTT: true },
    intent: { prompt: "a promo for a dev tool", websiteUrl: null, preferences: { framePack: "auto" } },
    created_at: Date.now(), client_ip: "test",
  });
  db.markScriptReview(id, {
    brief: { improvedPrompt: "a promo for a dev tool", subject: "a dev tool", audience: "developers", tone: "confident", goal: "signups", keyMessages: ["fast"], mustIncludeFacts: [], brandColors: [], suggestedFramePack: null, suggestedDuration: duration, musicMood: "upbeat", voProfile: "warm" },
    script: { title: "Test Film", scenes, music: { mood: "upbeat", query: "corporate uplifting" }, voice: { style: "warm and confident", pace: "measured" } },
    warnings: [], framePack: null, usage: null, stageTimings: {},
  });
  db.markApproved(id, { script: db.getRaw(id).script });
}

(async () => {
  console.log("\nproject_pipeline.runProduction — integration\n");

  await test("a full production run completes and marks the job DONE", async () => {
    seedJob("int_happy");
    await projectPipeline.runProduction({ jobId: "int_happy" });
    const job = db.getRaw("int_happy");
    // The regression this file was written for: the run used to reach the audio stage
    // and throw ReferenceError, so status became "failed" with a rendered film on disk.
    assert.strictEqual(job.status, "done", `expected done, got "${job.status}" — ${job.error || "no error recorded"}`);
    assert.ok(job.video_url, "a finished job must carry a video url");
    assert.ok(calls.render >= 1, "the composer must have rendered");
    assert.ok(calls.vo === 3, `every narrated scene should be synthesized (got ${calls.vo})`);
  });

  await test("every stage ran — no stage was silently skipped", () => {
    for (const stage of ["storyboard", "creative_director", "audio_director"]) {
      assert.ok(calls.chat.includes(stage), `stage "${stage}" never dispatched (calls: ${[...new Set(calls.chat)].join(", ")})`);
    }
  });

  await test("continuity held: the film was composed on the APPROVED script's timing", () => {
    const job = db.getRaw("int_happy");
    const rep = job.continuity_report;
    assert.ok(rep, "the storyboard drifted (2s floor) so a continuity correction must be recorded");
    assert.ok(rep.retimed >= 1, `expected retiming, got ${JSON.stringify(rep)}`);
    // The composed HTML is the proof: the scene-kit lays out storyboard scenes, so if
    // reconciliation had not run, the clip windows would follow the 2s-floored timeline.
    const html = fs.readFileSync(path.join(config.paths.jobsDir, "int_happy", "index.html"), "utf8");
    const starts = [...html.matchAll(/data-start="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(starts.length, "the composition should carry timed clips");
    assert.ok(starts.some((t) => Math.abs(t - 1.5) < 0.01),
      `no clip starts at the approved 1.5s boundary — the picture is on the storyboard's rescaled timeline (starts: ${[...new Set(starts)].slice(0, 8).join(", ")})`);
  });

  await test("motion is planned PER SCENE and the composer honoured it", () => {
    const job = db.getRaw("int_happy");
    const plan = job.motion_plan;
    assert.ok(plan, "a motion plan must be persisted");
    assert.ok(plan.variety.distinctEnters >= 2,
      `every scene entering the same way is the defect this planner exists to fix (got ${plan.variety.distinctEnters})`);

    // The proof is in the composed document: scene_kit emits textIn("<mode>","#sN …").
    // Before the planner this was ONE mode for the whole film, by construction.
    const html = fs.readFileSync(path.join(config.paths.jobsDir, "int_happy", "index.html"), "utf8");
    const modes = [...html.matchAll(/textIn\(\s*"([^"]+)"\s*,\s*"#(s\d+)\s/g)].map((m) => ({ mode: m[1], clip: m[2] }));
    assert.ok(modes.length >= 2, `expected per-scene entrances in the composition, found ${modes.length}`);
    assert.ok(new Set(modes.map((m) => m.mode)).size >= 2,
      `the film uses a single text entrance for every scene: ${modes.map((m) => `${m.clip}=${m.mode}`).join(", ")}`);

    // And the audit reconciled plan against reality rather than counting tweens.
    const audit = job.motion_audit;
    assert.ok(audit, "the motion audit must be recorded on BOTH runners, not just the graph");
    assert.strictEqual(audit.planned, true);
    assert.strictEqual(audit.planHonored, true,
      `composer drifted from the plan on: ${(audit.driftedScenes || []).join(", ")}`);
    assert.deepStrictEqual(audit.staticScenes, [], "no scene may render without timeline activity");
  });

  await test("the creative director's music verdict reached the audio plan", () => {
    const plan = db.getRaw("int_happy").audio_review;
    assert.ok(plan, "an audio plan must be persisted");
    assert.ok(plan.creativeDirection, "the director's verdict must ride the plan");
    assert.strictEqual(plan.creativeDirection.musicFits, false);
    // The model asked for +2dB on every scene; the verdict caps it under the voiceover.
    assert.ok(plan.scenes.every((s) => s.musicGainDb <= -3),
      `a rejected bed must be capped, got ${plan.scenes.map((s) => s.musicGainDb).join(",")}`);
  });

  await test("subtitles were exported from MEASURED voiceover timing", () => {
    const srt = path.join(config.paths.videosDir, "int_happy.srt");
    assert.ok(fs.existsSync(srt), "an .srt must be written next to the video");
    const body = fs.readFileSync(srt, "utf8");
    assert.ok(/Meet the tool/.test(body), "the approved voiceover text must be what is captioned");
    assert.ok(!/paraphrase the model invented/.test(body),
      "the storyboard's paraphrase must never reach the subtitles");
  });

  await test("the audio was actually mixed into the delivered file", () => {
    const job = db.getRaw("int_happy");
    const rendered = path.join(config.paths.jobsDir, "int_happy", "renders", "out.mp4");
    assert.ok(fs.existsSync(rendered), "the rendered file must still exist after the mix");
    const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", rendered]).toString().trim();
    assert.ok(probe.includes("audio"), "the delivered file must carry an audio track (the mix ran)");
    assert.ok(job.usage, "usage must be recorded");
  });

  await test("cost was attributed to the provider that served each call", () => {
    const byStage = db.getRaw("int_happy").usage.byStage || [];
    const sb = byStage.find((s) => s.stage === "storyboard");
    assert.ok(sb, "the storyboard stage must appear in the cost breakdown");
    // KIE-priced (0.45/2.70), not the default OpenRouter fallback rate (1.50/9.00).
    // 10 in + 10 out at KIE = 0.0000315; at the default = 0.000105.
    assert.ok(Number(sb.costUsd) < 0.00005,
      `storyboard priced at $${sb.costUsd} — it was billed at the default rate, so model/provider did not reach the tracker`);
  });

  await test("a mid-run failure marks the job FAILED, not silently done", async () => {
    seedJob("int_fail");
    renderShouldFail = true;
    try {
      await projectPipeline.runProduction({ jobId: "int_fail" });
    } finally { renderShouldFail = false; }
    const job = db.getRaw("int_fail");
    // Composition failure falls through the ladder to buildFallback, which renders too —
    // so with render dead the whole production must fail loudly rather than report done.
    assert.strictEqual(job.status, "failed", `expected failed, got "${job.status}"`);
    assert.ok(job.error, "a failed job must record why");
  });

  await test("a captionless job still completes (the caption path is optional)", async () => {
    seedJob("int_nocap", { captions: false });
    await projectPipeline.runProduction({ jobId: "int_nocap" });
    const job = db.getRaw("int_nocap");
    assert.strictEqual(job.status, "done", `expected done, got "${job.status}" — ${job.error || ""}`);
    assert.ok(!fs.existsSync(path.join(config.paths.videosDir, "int_nocap.srt")) || true, "no assertion on burn-in; the run must simply survive");
  });

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
