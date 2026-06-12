// The KEYFRAME agent graph — LangGraph orchestration of the 12 agents.
//
//   INTAKE GRAPH      brief → script  (pauses at script_review via the API)
//
//   PRODUCTION GRAPH                  ┌─ storyboard ── scene_planner ─┐
//     frame_selector ── fan-out ──────┼─ asset_planner ─ asset_search ┼── composition ── animation ─┐
//                                     └─ voice ───────────────────────┘                             │
//                                                  ┌──────────────────────────────────── timeline ──┘
//                                                  └→ qa ──(blockers & repairs left)→ composition (one repair lap)
//                                                       └──(pass / out of repairs)──→ END
//
// Every node is a thin agent wrapping the battle-tested service functions —
// the graph owns ordering, joins, and the QA repair loop; the services own
// the work. JSON state flows between nodes; HyperFrames renders the MP4.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const { UsageTracker } = require("../services/usage");
const { generateBrief } = require("../services/brief");
const { generateScript, normalizeScript } = require("../services/script");
const { generateStoryboard } = require("../services/storyboard");
const frameRegistry = require("../services/frame_registry");
const { withBudget, attemptLlmComposition, mixAudioIntoVideo, fallbackQueriesFor } = require("../services/pipeline");
const { acquire, hasProviderFor } = require("../services/asset_sources");
const { synthesizeFitted } = require("../services/vo_fit");
const { buildCues, writeSrt } = require("../services/captions");
const { fetchMusic } = require("../services/audio_sources");
const { getSfx } = require("../services/sfx_library");
const { VALID_VOICES } = require("../services/audio_planner");
const { buildFallback } = require("../services/fallback");
const { render } = require("../services/renderer");
const { reviewRender } = require("./qa_agent");

function ms() { return Date.now(); }
function jobDirFor(jobId) { return path.join(config.paths.jobsDir, jobId); }

// ---------------------------------------------------------------- helpers
function storyboardPromptFromScript(script, brief) {
  const lines = [
    `Produce this exact video: "${script.title}".`,
    brief ? `Context: ${brief.improvedPrompt}` : "",
    "",
    "Scene-by-scene plan (FOLLOW these timings and contents exactly — same number of scenes, same start/duration):",
  ];
  for (const s of script.scenes) {
    lines.push(
      `- Scene ${s.id} [${s.start}s + ${s.duration}s] (${s.purpose}): ${s.visualDirection} ` +
      (s.onScreenText.length ? `On-screen text: ${s.onScreenText.map((t) => `"${t}"`).join(", ")}. ` : "") +
      (s.voiceover ? `Narration meanwhile: "${s.voiceover}"` : "No narration.")
    );
  }
  return lines.join("\n");
}

function pickVoice(job, script) {
  const want = (job.voice_style || script?.voice?.style || "").toLowerCase();
  for (const v of VALID_VOICES) if (want.includes(v)) return v;
  return "marin";
}

// ---------------------------------------------------------------- agents
// Each node receives the mutable graph state object and returns a partial
// state update. `s` carries: job, jobDir, tracker, script, brief, and the
// artifacts each agent adds.

async function frameSelectorAgent(s) {
  const framePack = frameRegistry.resolvePack(s.job.frame_pack || s.brief?.suggestedFramePack || "auto");
  console.log(`[agents] frame_selector → ${framePack}`);
  return { framePack };
}

async function storyboardAgent(s) {
  db.setProgress(s.job.id, "storyboard");
  const sbPrompt = storyboardPromptFromScript(s.script, s.brief);
  const r = await generateStoryboard({ prompt: sbPrompt, duration: s.job.duration, orientation: s.job.orientation });
  s.tracker.addLlm({ inputTokens: r.tokensIn, outputTokens: r.tokensOut });
  return { storyboard: r.storyboard };
}

// Scene Planner — guarantees every storyboard scene has executable beats.
// Deterministic: derives default beats from the script when the model
// omitted them (entrance at 0.1, content at 30%, exit 0.6s before handoff).
async function scenePlannerAgent(s) {
  const sb = s.storyboard;
  let derived = 0;
  for (const scene of sb.scenes || []) {
    if (!Array.isArray(scene.beats) || !scene.beats.length) {
      scene.beats = [
        { at: 0.1, action: "scene content enters", easing: "expo.out" },
        { at: Math.round(scene.duration * 0.3 * 100) / 100, action: "supporting content lands", easing: "power2.out" },
        { at: Math.max(0.2, scene.duration - 0.6), action: "exit begins / hand-off", easing: "power2.in" },
      ];
      derived++;
    }
  }
  if (derived) console.log(`[agents] scene_planner derived beats for ${derived} scene(s)`);
  return { storyboard: sb };
}

// Asset Planner — turns the approved script's needs into a concrete
// want-list (screenshots pinned first, stock wants after, caps applied).
async function assetPlannerAgent(s) {
  const { job, script } = s;
  const videoOk = hasProviderFor("video");
  const shots = (job.website_screenshots || []).filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
  const showcase = script.scenes.filter((x) => ["feature", "proof", "how", "context"].includes(x.purpose));
  const targets = (showcase.length ? showcase : script.scenes.slice(1, -1)).slice(0, 3);
  const screenshotPlan = shots.slice(0, targets.length).map((src, i) => ({ kind: "screenshot", src, scene: targets[i], index: i }));
  const pinnedSceneIds = new Set(screenshotPlan.map((p) => p.scene.id));

  // Derive a concrete image query from a scene's visualDirection when the
  // script asked for nothing — substance scenes should never go imageless.
  const STOP = new Set(["the", "a", "an", "with", "and", "of", "in", "on", "over", "into", "across", "as", "to", "that", "then", "while", "for", "is", "are", "we", "see", "scene", "text", "headline", "screen"]);
  const deriveQuery = (scene) => {
    const words = String(scene.visualDirection || "").toLowerCase().match(/[a-z]{3,}/g) || [];
    const picked = words.filter((w) => !STOP.has(w)).slice(0, 4);
    return picked.length >= 2 ? picked.join(" ") : null;
  };

  const wants = [];
  for (const scene of script.scenes) {
    const needs = [...(scene.assetNeeds || [])];
    // Gap-fill: substance scenes with no asset request get a derived one.
    if (!needs.length && !pinnedSceneIds.has(scene.id) && !["hook", "cta"].includes(scene.purpose)) {
      const q = deriveQuery(scene);
      if (q) needs.push({ type: "image", query: q, role: "background", derived: true });
    }
    for (const need of needs) {
      if (pinnedSceneIds.has(scene.id) && need.role === "background") continue;
      const type = need.type === "video" && !videoOk ? "image" : need.type;
      wants.push({ kind: "search", scene, need: { ...need, type } });
    }
  }
  const videos = wants.filter((w) => w.need.type === "video").slice(0, 1);
  const images = wants.filter((w) => w.need.type !== "video").slice(0, 9 - videos.length);
  console.log(`[agents] asset_planner: ${screenshotPlan.length} screenshot(s) + ${videos.length + images.length} search want(s) (${wants.filter((w) => w.need.derived).length} derived)`);
  return { assetPlan: { screenshots: screenshotPlan, searches: [...videos, ...images] } };
}

// Asset Search — executes the plan: our database first, then providers.
async function assetSearchAgent(s) {
  const { job, jobDir, tracker, assetPlan } = s;
  db.setProgress(job.id, "assets");
  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "assets", "videos"), { recursive: true });

  const pinned = assetPlan.screenshots.map(({ src, scene, index }) => {
    const relPath = `assets/images/site_${index}.png`;
    fs.copyFileSync(src, path.join(jobDir, relPath));
    return {
      path: relPath, type: "image", sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
      style: "inset",
      alt: `REAL website screenshot of ${job.website_title || "the product"} (${index === 0 ? "homepage hero" : `page section ${index + 1}`}) — present in a styled browser frame with hero treatment`,
      license: "owner content", sourceUrl: job.intent?.websiteUrl || null, source: "website", fromCache: false,
    };
  });

  let iImg = 0, iVid = 0;
  const got = (await Promise.all(assetPlan.searches.map(({ scene, need }) => {
    const isVideo = need.type === "video";
    const relPath = isVideo ? `assets/videos/${iVid++}.mp4` : `assets/images/${iImg++}.jpg`;
    const query = need.type === "icon" ? `${need.query} icon flat` : need.query;
    return acquire({
      query, fallbackQueries: fallbackQueriesFor(query), type: isVideo ? "video" : "image",
      orientation: job.orientation, outputPath: path.join(jobDir, relPath), tracker,
    }).then((r) => r ? {
      path: relPath, type: isVideo ? "video" : "image",
      sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
      style: need.role === "inset" ? "inset" : "background", alt: need.query,
      license: r.license, sourceUrl: r.sourceUrl, source: r.source, fromCache: r.fromCache === true,
    } : null).catch(() => null);
  }))).filter(Boolean);

  const assets = [...pinned, ...got];
  db.setAssets(job.id, assets);
  console.log(`[agents] asset_search: ${assets.length} asset(s) (${got.filter((a) => a.fromCache).length} from cache)`);
  return { assets };
}

// Voice Agent — per-scene fitted VO + script SFX + music, in parallel.
async function voiceAgent(s) {
  const { job, jobDir, tracker, script } = s;
  const audioDir = path.join(jobDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  const voice = pickVoice(job, script);
  const instructions = `${script.voice.style}. Pace: ${script.voice.pace}.`;

  const voTask = Promise.all(script.scenes.map((sc) =>
    (sc.voiceover && sc.voiceover.trim())
      ? synthesizeFitted({ text: sc.voiceover, targetSec: sc.duration, voice, instructions, outputPath: path.join(audioDir, `vo-${sc.id}.mp3`), tracker })
          .then((r) => r ? { sceneId: sc.id, startSec: sc.start, durationSec: r.durationSec, sceneDurationSec: sc.duration, text: r.text, path: r.path } : null)
          .catch((e) => { console.warn(`[agents] vo ${sc.id} failed: ${e.message}`); return null; })
      : Promise.resolve(null)
  )).then((a) => a.filter(Boolean));

  const sfxWanted = [];
  for (const sc of script.scenes) for (const name of (sc.sfx || [])) if (sfxWanted.length < 6) sfxWanted.push({ name, startSec: sc.start });
  const sfxTask = Promise.all(sfxWanted.map((x, i) =>
    getSfx({ name: x.name, outputPath: path.join(audioDir, `sfx-${i}.mp3`), tracker })
      .then((p) => p ? { path: p, startSec: x.startSec, volume: 0.4 } : null).catch(() => null)
  )).then((a) => a.filter(Boolean));

  const musicTask = script.music?.query
    ? fetchMusic({ query: script.music.query, outputPath: path.join(audioDir, "music.mp3"), tracker }).catch(() => null)
    : Promise.resolve(null);

  const [voClips, sfxClips, musicPath] = await Promise.all([voTask, sfxTask, musicTask]);
  console.log(`[agents] voice: ${voClips.length} vo clip(s), ${sfxClips.length} sfx, music=${!!musicPath}`);
  return { voClips, sfxClips, musicPath };
}

// Composition Agent (+ the Animation agent's work product: the timeline).
async function compositionAgent(s) {
  const { job, jobDir, tracker } = s;
  db.setProgress(job.id, "composing");
  const dims = { width: job.width, height: job.height, fps: job.fps };

  const wc = (t) => (String(t || "").match(/\S+/g) || []).length;
  const captionCues = job.captions_enabled === 0 ? [] : buildCues(
    s.script.scenes.filter((x) => x.voiceover && x.voiceover.trim()).map((x) => ({
      sceneId: x.id, startSec: x.start,
      durationSec: Math.min(x.duration, wc(x.voiceover) / 2.6 + 0.4),
      sceneDurationSec: x.duration, text: x.voiceover,
    }))
  ).map((c) => ({ start: Math.round(c.start * 10) / 10, end: Math.round(c.end * 10) / 10, text: c.text }));

  // Carry QA repair feedback into the composer when looping.
  const storyboard = s.qa && s.qa.issues?.length
    ? { ...s.storyboard, __qaIssuesToFix: s.qa.issues.map((i) => `at ${i.atSec}s [${i.severity}]: ${i.issue} — FIX: ${i.fix}`) }
    : s.storyboard;

  const budget = (Number(config.server.stageBudgetSec) || 480) * 1000;
  try {
    const visual = await withBudget(
      (signal) => attemptLlmComposition({
        storyboard, dims, jobDir, assets: s.assets || [], tracker,
        jobId: job.id, durationSec: job.duration,
        label: s.qa ? "graph-repair" : "graph-main", abortSignal: signal,
        framePack: s.framePack, captionCues,
      }),
      budget, "composition agent"
    );
    return { visual, usedFallback: false, finalAttempt: s.qa ? "qa-repair" : "main" };
  } catch (e) {
    console.warn(`[agents] composition failed (${e.message.slice(0, 180)}); deterministic fallback`);
    try {
      if (fs.existsSync(path.join(jobDir, "index.html"))) {
        fs.copyFileSync(path.join(jobDir, "index.html"), path.join(jobDir, "index.llm-attempt.html"));
      }
    } catch { /* best effort */ }
    const fb = buildFallback({
      prompt: s.brief?.improvedPrompt || job.prompt, duration: job.duration,
      orientation: job.orientation, width: dims.width, height: dims.height, fps: dims.fps,
      storyboard: s.storyboard,
      packTokens: s.framePack ? frameRegistry.getPackTokens(s.framePack) : null,
    });
    fs.writeFileSync(path.join(jobDir, "index.html"), fb.indexHtml, "utf8");
    fs.writeFileSync(path.join(jobDir, "meta.json"), fb.metaJson, "utf8");
    tracker.addExternal("hyperframes_render");
    const visual = await render({ jobId: job.id, jobDir, durationSec: job.duration });
    return { visual, usedFallback: true, finalAttempt: "fallback", rendered: true };
  }
}

// Animation Agent — deterministic timeline audit of the composed HTML:
// every scene window must be covered by timeline activity, and the known
// footguns must be absent. Produces warnings; never blocks (QA decides).
async function animationAgent(s) {
  if (s.usedFallback) return { animationReport: { warnings: ["fallback composition"] } };
  let html = "";
  try { html = fs.readFileSync(path.join(s.jobDir, "index.html"), "utf8"); } catch { /* no file */ }
  const warnings = [];
  if (/repeat:\s*-1/.test(html)) warnings.push("repeat:-1 found (breaks deterministic capture)");
  if (/style="[^"]*transform:\s*translate/i.test(html)) warnings.push("inline transform hidden-state found (composes with GSAP xPercent — content may stay offscreen)");
  const tweenCount = (html.match(/tl\.(to|fromTo|from|set)\(/g) || []).length;
  const sceneCount = (s.storyboard?.scenes || []).length || 1;
  if (tweenCount < sceneCount * 2) warnings.push(`only ${tweenCount} timeline calls for ${sceneCount} scenes — likely under-animated`);
  if (warnings.length) console.warn(`[agents] animation audit: ${warnings.join(" | ")}`);
  return { animationReport: { tweenCount, warnings } };
}

// Timeline Agent — render (if not already), captions/SRT, audio mix.
async function timelineAgent(s) {
  const { job, jobDir, tracker } = s;
  let visual = s.visual;
  if (!s.rendered && !s.usedFallback) {
    // attemptLlmComposition already rendered; only the fallback path marks
    // rendered itself. visual is set either way.
  }
  db.setProgress(job.id, "audio");

  const cues = buildCues(s.voClips || []);
  if (cues.length) {
    try {
      const srtPath = path.join(config.paths.videosDir, `${job.id}.srt`);
      writeSrt(cues, srtPath);
      db.setCaptions(job.id, { cues, srtUrl: `/videos/${job.id}.srt` });
    } catch (e) { console.warn(`[agents] srt failed: ${e.message}`); }
  }

  await mixAudioIntoVideo({
    visualPath: visual.videoPath,
    durationSec: job.duration,
    audio: {
      ttsPath: null,
      musicPath: s.musicPath || null,
      sfx: [
        ...(s.voClips || []).map((c) => ({ path: c.path, startSec: c.startSec, volume: 1.0 })),
        ...(s.sfxClips || []),
      ],
      musicVolume: config.audio?.defaultMusicVolume ?? 0.15,
    },
  }).catch((e) => console.warn(`[agents] mix failed: ${e.message}`));

  return { visual };
}

// Repair lap — re-runs composition → animation audit → timeline as one
// node so the QA loop never re-enters the first lap's parallel joins.
async function repairAgent(s) {
  const comp = await compositionAgent(s);
  const m1 = { ...s, ...comp };
  const anim = await animationAgent(m1);
  const tl = await timelineAgent({ ...m1, ...anim });
  return { ...comp, ...anim, ...tl };
}

// QA Agent node — verdict + loop control.
async function qaAgentNode(s) {
  if (config.qa?.enabled === false || s.usedFallback) {
    return { qa: { pass: true, issues: [], skipped: true } };
  }
  db.setProgress(s.job.id, "qa");
  const verdict = await reviewRender({
    videoPath: s.visual.videoPath,
    scenes: s.script.scenes,
    duration: s.job.duration,
    framePack: s.framePack,
    workDir: path.join(s.jobDir, "qa"),
    tracker: s.tracker,
  }).catch((e) => {
    console.warn(`[agents] qa failed (${e.message.slice(0, 120)}); passing by default`);
    return { pass: true, issues: [], error: e.message };
  });
  return { qa: verdict, qaAttempts: (s.qaAttempts || 0) + 1 };
}

// ---------------------------------------------------------------- graph
let compiledGraph = null;

async function buildGraph() {
  if (compiledGraph) return compiledGraph;
  const { StateGraph, Annotation, START, END } = await import("@langchain/langgraph");

  const S = Annotation.Root({
    job: Annotation(), jobDir: Annotation(), tracker: Annotation(),
    brief: Annotation(), script: Annotation(),
    framePack: Annotation(), storyboard: Annotation(),
    assetPlan: Annotation(), assets: Annotation(),
    voClips: Annotation(), sfxClips: Annotation(), musicPath: Annotation(),
    visual: Annotation(), usedFallback: Annotation(), finalAttempt: Annotation(), rendered: Annotation(),
    animationReport: Annotation(), qa: Annotation(), qaAttempts: Annotation(),
  });

  // Node names must not collide with state channel names (LangGraph rule),
  // hence the _agent suffixes on storyboard/qa.
  const g = new StateGraph(S)
    .addNode("frame_selector", frameSelectorAgent)
    .addNode("storyboard_agent", storyboardAgent)
    .addNode("scene_planner", scenePlannerAgent)
    .addNode("asset_planner", assetPlannerAgent)
    .addNode("asset_search", assetSearchAgent)
    .addNode("voice_agent", voiceAgent)
    .addNode("composition", compositionAgent)
    .addNode("animation", animationAgent)
    .addNode("timeline", timelineAgent)
    .addNode("qa_agent", qaAgentNode)
    .addNode("repair", repairAgent);

  g.addEdge(START, "frame_selector");
  // Fan-out: three branches run in parallel.
  g.addEdge("frame_selector", "storyboard_agent");
  g.addEdge("frame_selector", "asset_planner");
  g.addEdge("frame_selector", "voice_agent");
  g.addEdge("storyboard_agent", "scene_planner");
  g.addEdge("asset_planner", "asset_search");
  // Join: composition needs the plan AND the assets.
  g.addEdge(["scene_planner", "asset_search"], "composition");
  g.addEdge("composition", "animation");
  // Join: the timeline mix needs the render AND the voice branch.
  g.addEdge(["animation", "voice_agent"], "timeline");
  g.addEdge("timeline", "qa_agent");
  g.addConditionalEdges("qa_agent", (s) => {
    const repairsLeft = (s.qaAttempts || 0) <= (Number(config.qa?.maxRepairs) || 1);
    if (!s.qa?.pass && repairsLeft && !s.usedFallback) {
      console.log(`[agents] QA failed — repair lap ${s.qaAttempts}`);
      return "repair";
    }
    return END;
  }, ["repair", END]);
  g.addEdge("repair", "qa_agent");

  compiledGraph = g.compile();
  return compiledGraph;
}

// ---------------------------------------------------------------- runner
async function runProductionGraph({ jobId }) {
  const job = db.getRaw(jobId);
  if (!job || !job.script) {
    console.error(`[agents] ${jobId} aborted: no approved script`);
    return;
  }
  const jobDir = jobDirFor(jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  db.markStarted(jobId);

  const tracker = new UsageTracker();
  const t0 = ms();
  const script = normalizeScript(job.script, { targetDuration: job.duration });

  try {
    const graph = await buildGraph();
    const final = await graph.invoke(
      { job, jobDir, tracker, brief: job.brief, script, qaAttempts: 0 },
      { recursionLimit: 40 }
    );

    const costs = tracker.computeCosts();
    db.markDone(jobId, {
      videoUrl: final.visual.videoUrl,
      usedFallback: final.usedFallback === true,
      tokensIn: costs.llm.inputTokens,
      tokensOut: costs.llm.outputTokens,
      usage: costs,
      stageTimings: { ...(job.stage_timings || {}), productionMs: ms() - t0 },
      finalAttempt: final.finalAttempt || "main",
    });
    if (final.qa) db.setQa(jobId, final.qa);
    console.log(`[agents] ${jobId} done — ${final.finalAttempt}, qa=${final.qa?.pass === false ? "FAILED(delivered best attempt)" : final.qa?.skipped ? "skipped" : "pass"}, cost=$${costs.totalCostUsd}`);
  } catch (err) {
    console.error(`[agents] ${jobId} graph failed: ${err.message}`);
    const costs = tracker.computeCosts();
    db.markFailed(jobId, err.message.slice(0, 2000), costs.llm.inputTokens, costs.llm.outputTokens, costs);
  }
}

module.exports = { runProductionGraph };
