// Orchestrates a multi-tier pipeline that degrades gracefully on failure:
//
//   1. Full: storyboard → [assets: plan + parallel-fetch] → compose → lint (+ repair) → render
//   2. Retry WITHOUT videos (keeps images) if render or compose fails
//   3. Retry WITHOUT any assets if still failing
//   4. Polished deterministic fallback composition
//
//   Then ALWAYS: if any audio flag was requested, plan + fetch + mix it in.
//   So a failure in the visual layer never loses TTS / music / SFX.
//
// Collects per-stage timings and per-job usage/cost via UsageTracker,
// attached to the job record.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const { UsageTracker } = require("./usage");
const { generateStoryboard } = require("./storyboard");
const { compose } = require("./composer");
const { validate } = require("./validator");
const { render } = require("./renderer");
const { buildFallback } = require("./fallback");
const { planAudio } = require("./audio_planner");
const { synthesize: ttsSynthesize } = require("./tts");
const { fetchMusic, fetchSfx } = require("./audio_sources");
const { mix: audioMix } = require("./audio_mix");
const { planAssets } = require("./asset_planner");
const { fetchImage, fetchVideo } = require("./pixabay_visual");
const catalog = require("./catalog");

function jobDirFor(jobId) { return path.join(config.paths.jobsDir, jobId); }
function ms() { return Date.now(); }

// Wrap a promise factory with a hard wall-clock timeout AND signal-based
// cancellation so the underlying work can actually stop (not just be
// ignored). `factory(signal)` must honor the AbortSignal — used by the
// renderer to kill its subprocess promptly.
function withBudget(factory, budgetMs, label) {
  const ac = new AbortController();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      ac.abort(new Error(`${label} exceeded budget of ${budgetMs}ms`));
      reject(new Error(`${label} exceeded budget of ${budgetMs}ms`));
    }, budgetMs);
    Promise.resolve(factory(ac.signal)).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

// ========== Visual assets stage (parallel fetches) ==========

async function planAndFetchAssets({ jobDir, storyboard, flags, orientation, tracker }) {
  if (!flags.images && !flags.video) return { assets: [] };

  const { plan, tokensIn, tokensOut, error } = await planAssets(storyboard, {
    images: flags.images, video: flags.video,
  });
  tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut });

  if (error) {
    console.warn(`[pipeline] asset planner failed (${error}); continuing without visuals`);
    return { assets: [] };
  }

  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "assets", "videos"), { recursive: true });

  const tasks = [];

  if (flags.images && Array.isArray(plan.images)) {
    plan.images.forEach((a, i) => {
      const relPath = `assets/images/${i}.jpg`;
      const absPath = path.join(jobDir, relPath);
      tasks.push(
        fetchImage({ query: a.query, orientation, outputPath: absPath, tracker })
          .then((got) => got ? {
            path: relPath, type: "image",
            sceneId: a.sceneId, startSec: a.startSec,
            durationSec: a.durationSec, style: a.style, alt: a.alt,
          } : null)
          .catch(() => null)
      );
    });
  }

  if (flags.video && Array.isArray(plan.videos)) {
    plan.videos.forEach((a, i) => {
      const relPath = `assets/videos/${i}.mp4`;
      const absPath = path.join(jobDir, relPath);
      tasks.push(
        fetchVideo({ query: a.query, orientation, outputPath: absPath, tracker })
          .then((got) => got ? {
            path: relPath, type: "video",
            sceneId: a.sceneId, startSec: a.startSec,
            durationSec: a.durationSec, style: a.style,
          } : null)
          .catch(() => null)
      );
    });
  }

  const results = (await Promise.all(tasks)).filter(Boolean);
  console.log(`[pipeline] fetched ${results.length} visual asset(s) in parallel`);
  return { assets: results };
}

// ========== Composition + lint repair ==========

async function composeWithLintRepair({ storyboard, dims, jobDir, availableAssets, tracker, abortSignal }) {
  console.log(`[pipeline] composeWithLintRepair: calling composer (first pass)`);
  const first = await compose(storyboard, {
    width: dims.width, height: dims.height, fps: dims.fps,
    duration: storyboard.durationSec,
    maxRetries: config.llm.composerMaxRetries,
    availableAssets,
    abortSignal,
  });
  tracker.addLlm({ inputTokens: first.tokensIn, outputTokens: first.tokensOut });

  // Install any catalog blocks the LLM referenced via data-composition-src.
  try {
    const r = await catalog.installReferencedBlocks(first.indexHtml, jobDir);
    if (r.installed.length) tracker.addExternal("catalog_install");
    if (r.failed.length) {
      console.warn(`[pipeline] catalog installs failed for: ${r.failed.join(", ")}`);
    }
  } catch (e) {
    console.warn(`[pipeline] catalog install step threw: ${e.message}`);
  }

  console.log(`[pipeline] composeWithLintRepair: running hyperframes lint`);
  tracker.addExternal("hyperframes_lint");
  const lint1 = await validate(jobDir, { indexHtml: first.indexHtml, metaJson: first.metaJson });
  if (lint1.ok) { console.log(`[pipeline] lint passed on first attempt`); return { files: first }; }

  console.warn(`[pipeline] lint failed; attempting repair. stderr tail: ${lint1.stderr.slice(-500)}`);
  const repairStoryboard = { ...storyboard,
    __lintFeedback: `Previous HTML failed hyperframes lint with:\n${lint1.stderr || lint1.stdout}\nFix these issues specifically.`,
  };
  const second = await compose(repairStoryboard, {
    width: dims.width, height: dims.height, fps: dims.fps,
    duration: storyboard.durationSec, maxRetries: 1, availableAssets,
    abortSignal,
  });
  tracker.addLlm({ inputTokens: second.tokensIn, outputTokens: second.tokensOut });

  try {
    const r = await catalog.installReferencedBlocks(second.indexHtml, jobDir);
    if (r.installed.length) tracker.addExternal("catalog_install");
  } catch (e) { /* non-fatal */ }

  tracker.addExternal("hyperframes_lint");
  const lint2 = await validate(jobDir, { indexHtml: second.indexHtml, metaJson: second.metaJson });
  if (lint2.ok) return { files: second };

  const err = new Error(`lint still failed after repair: ${lint2.stderr.slice(-500)}`);
  throw err;
}

// ========== One attempt at full LLM comp + render with a given asset set ==========

async function attemptLlmComposition({ storyboard, dims, jobDir, assets, tracker, jobId, durationSec, label, abortSignal }) {
  const t0 = ms();
  console.log(`[pipeline] ${label}: compose start (assets=${assets.length})`);
  await composeWithLintRepair({
    storyboard, dims, jobDir, availableAssets: assets, tracker, abortSignal,
  });
  console.log(`[pipeline] ${label}: compose done in ${ms() - t0}ms, render start`);
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  console.log(`[pipeline] ${label}: render done in ${ms() - t0}ms total`);
  return visual;
}

// ========== Audio assets stage ==========

async function buildAudio({ jobDir, storyboard, flags, tracker }) {
  const audioDir = path.join(jobDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  const { plan, tokensIn, tokensOut, error: planErr } = await planAudio(storyboard, flags);
  tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut });

  if (planErr) {
    console.warn(`[pipeline] audio planner failed: ${planErr}. Skipping audio.`);
    return { ttsPath: null, musicPath: null, sfx: [], musicVolume: 0.15 };
  }

  // Run TTS + music + all SFX fetches in parallel.
  const ttsTask = (flags.tts && plan.tts)
    ? ttsSynthesize({
        script: plan.tts.script, voice: plan.tts.voice,
        instructions: plan.tts.instructions,
        outputPath: path.join(audioDir, "tts.mp3"), tracker,
      }).then((p) => {
        console.log(`[pipeline] tts generated (${plan.tts.voice})`);
        return p;
      }).catch((e) => {
        console.warn(`[pipeline] tts failed: ${e.message}`);
        return null;
      })
    : Promise.resolve(null);

  let musicVolume = config.audio?.defaultMusicVolume ?? 0.15;
  if (flags.music && plan.music?.volume) musicVolume = plan.music.volume;

  const musicTask = (flags.music && plan.music?.query)
    ? fetchMusic({ query: plan.music.query, outputPath: path.join(audioDir, "music.mp3"), tracker })
        .then((p) => { if (p) console.log(`[pipeline] music fetched ("${plan.music.query}")`); return p; })
        .catch((e) => { console.warn(`[pipeline] music failed: ${e.message}`); return null; })
    : Promise.resolve(null);

  const sfxPlan = (flags.soundEffect && Array.isArray(plan.soundEffects)) ? plan.soundEffects : [];
  const sfxTasks = sfxPlan.map((s, i) =>
    fetchSfx({ query: s.query, outputPath: path.join(audioDir, `sfx-${i}.mp3`), tracker })
      .then((p) => p ? { path: p, startSec: s.startSec, volume: s.volume } : null)
      .catch(() => null)
  );

  const [ttsPath, musicPath, ...sfxResults] = await Promise.all([ttsTask, musicTask, ...sfxTasks]);
  const sfx = sfxResults.filter(Boolean);
  if (sfx.length) console.log(`[pipeline] sfx: ${sfx.length}/${sfxPlan.length} fetched`);

  return { ttsPath, musicPath, sfx, musicVolume };
}

async function mixAudioIntoVideo({ visualPath, durationSec, audio }) {
  if (!audio.ttsPath && !audio.musicPath && audio.sfx.length === 0) return false;
  const mixedPath = path.join(config.paths.videosDir, path.basename(visualPath) + ".tmp.mp4");
  await audioMix({
    videoPath: visualPath, outputPath: mixedPath, durationSec,
    ttsPath: audio.ttsPath, musicPath: audio.musicPath,
    musicVolume: audio.musicVolume, sfx: audio.sfx,
  });
  fs.renameSync(mixedPath, visualPath);
  return true;
}

// ========== Main ==========

async function runJob({
  jobId, prompt, duration, orientation, width, height, fps,
  tts = false, music = false, soundEffect = false, voice,
  images = false, video = false,
}) {
  const jobDir = jobDirFor(jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const tracker = new UsageTracker();
  const timings = {};
  const markStage = (name, startAt) => { timings[name + "Ms"] = ms() - startAt; };

  db.markStarted(jobId);
  let usedFallback = false;
  let finalAttempt = "main";
  let visualResult = null;
  let sbRes = null;

  const dims = { width, height, fps };
  const wantsAudio = tts || music || soundEffect;

  try {
    // ---- Stage: storyboard ----
    {
      const t0 = ms();
      db.setProgress(jobId, "storyboard");
      sbRes = await generateStoryboard({ prompt, duration, orientation });
      tracker.addLlm({ inputTokens: sbRes.tokensIn, outputTokens: sbRes.tokensOut });
      markStage("storyboard", t0);
      console.log(`[pipeline] storyboard completed in ${timings.storyboardMs}ms`);
    }

    // ---- Stages: assets + audio prep run IN PARALLEL (both need only storyboard).
    // The audio result is held in a promise used later at mix time. Asset fetch
    // must complete before composer starts (it needs the asset paths), so we
    // await only the assets here — audio keeps cooking in the background.
    db.setProgress(jobId, "assets");
    const audioPromise = wantsAudio
      ? buildAudio({
          jobDir, storyboard: sbRes.storyboard,
          flags: { tts, music, soundEffect, voice }, tracker,
        }).catch((e) => {
          console.warn(`[pipeline] background audio stage failed: ${e.message}`);
          return { ttsPath: null, musicPath: null, sfx: [], musicVolume: 0.15 };
        })
      : Promise.resolve(null);

    let allAssets = [];
    if (images || video) {
      const t0 = ms();
      const va = await planAndFetchAssets({
        jobDir, storyboard: sbRes.storyboard,
        flags: { images, video }, orientation, tracker,
      }).catch((e) => {
        console.warn(`[pipeline] asset stage threw: ${e.message}`);
        return { assets: [] };
      });
      allAssets = va.assets;
      markStage("assets", t0);
      console.log(`[pipeline] assets completed in ${timings.assetsMs}ms (${allAssets.length} fetched; audio running in parallel)`);
    }

    const budget = (Number(config.server.stageBudgetSec) || 240) * 1000;

    // ---- Attempt 1: full LLM composition with all assets ----
    {
      const t0 = ms();
      db.setProgress(jobId, "composing");
      try {
        visualResult = await withBudget(
          (signal) => attemptLlmComposition({
            storyboard: sbRes.storyboard, dims, jobDir,
            assets: allAssets, tracker, jobId, durationSec: duration,
            label: "main", abortSignal: signal,
          }),
          budget, "main composition"
        );
        markStage("compose_render", t0);
        console.log(`[pipeline] main composition+render succeeded in ${timings.compose_renderMs}ms`);
      } catch (e1) {
        markStage("compose_render", t0);
        console.warn(`[pipeline] main attempt failed (${e1.message.slice(0, 200)}). Retrying without videos.`);
      }
    }

    // ---- Attempt 2: retry dropping videos (keep images) ----
    if (!visualResult && allAssets.some((a) => a.type === "video")) {
      const imagesOnly = allAssets.filter((a) => a.type === "image");
      const t0 = ms();
      finalAttempt = "no-videos";
      try {
        visualResult = await withBudget(
          (signal) => attemptLlmComposition({
            storyboard: sbRes.storyboard, dims, jobDir,
            assets: imagesOnly, tracker, jobId, durationSec: duration,
            label: "no-videos", abortSignal: signal,
          }),
          budget, "no-videos retry"
        );
        markStage("retry_no_videos", t0);
        console.log(`[pipeline] images-only retry succeeded in ${timings.retry_no_videosMs}ms`);
      } catch (e2) {
        markStage("retry_no_videos", t0);
        console.warn(`[pipeline] images-only retry failed (${e2.message.slice(0, 200)}). Retrying without any assets.`);
      }
    }

    // ---- Attempt 3: retry without any assets ----
    if (!visualResult && allAssets.length > 0) {
      const t0 = ms();
      finalAttempt = "no-assets";
      try {
        visualResult = await withBudget(
          (signal) => attemptLlmComposition({
            storyboard: sbRes.storyboard, dims, jobDir,
            assets: [], tracker, jobId, durationSec: duration,
            label: "no-assets", abortSignal: signal,
          }),
          budget, "no-assets retry"
        );
        markStage("retry_no_assets", t0);
        console.log(`[pipeline] asset-less retry succeeded in ${timings.retry_no_assetsMs}ms`);
      } catch (e3) {
        markStage("retry_no_assets", t0);
        console.warn(`[pipeline] asset-less retry failed (${e3.message.slice(0, 200)}). Using polished fallback.`);
      }
    }

    // ---- Attempt 4: polished deterministic fallback ----
    if (!visualResult) {
      const t0 = ms();
      finalAttempt = "fallback";
      usedFallback = true;
      const fb = buildFallback({
        prompt, duration, orientation, width, height, fps,
        storyboard: sbRes.storyboard,
      });
      fs.writeFileSync(path.join(jobDir, "index.html"), fb.indexHtml, "utf8");
      fs.writeFileSync(path.join(jobDir, "meta.json"), fb.metaJson, "utf8");
      tracker.addExternal("hyperframes_render");
      visualResult = await render({ jobId, jobDir, durationSec: duration });
      markStage("fallback_render", t0);
      console.log(`[pipeline] polished fallback rendered in ${timings.fallback_renderMs}ms`);
    }

    // ---- Stage: audio mix (audio was prepared in parallel with compose+render)
    if (wantsAudio) {
      const t0 = ms();
      db.setProgress(jobId, "audio");
      try {
        const audio = await audioPromise;
        const mixed = await mixAudioIntoVideo({
          visualPath: visualResult.videoPath,
          durationSec: duration, audio,
        }).catch((e) => { console.warn(`[pipeline] mix failed: ${e.message}`); return false; });
        markStage("audio", t0);
        console.log(`[pipeline] audio ${mixed ? "mixed in" : "(nothing to mix)"} in ${timings.audioMs}ms (was prepared in parallel)`);
      } catch (e) {
        markStage("audio", t0);
        console.warn(`[pipeline] audio stage failed: ${e.message}`);
      }
    }

    // ---- Finalize ----
    db.setProgress(jobId, "finalizing");
    const costs = tracker.computeCosts();
    db.markDone(jobId, {
      videoUrl: visualResult.videoUrl,
      usedFallback,
      tokensIn:  costs.llm.inputTokens,
      tokensOut: costs.llm.outputTokens,
      usage:     costs,
      stageTimings: timings,
      finalAttempt,
    });

    console.log(`[pipeline] job ${jobId} done — attempt=${finalAttempt}, fallback=${usedFallback}, visuals=${allAssets.length}, audio=${wantsAudio}, cost=$${costs.totalCostUsd}, timings=${JSON.stringify(timings)}`);
  } catch (err) {
    // Something even the polished fallback couldn't handle. Mark failed.
    console.error(`[pipeline] job ${jobId} failed fatally: ${err.message}`);
    const costs = tracker.computeCosts();
    db.markFailed(
      jobId,
      err.message.slice(0, 2000),
      costs.llm.inputTokens,
      costs.llm.outputTokens,
      costs,
      timings,
    );
  }
}

module.exports = { runJob };
