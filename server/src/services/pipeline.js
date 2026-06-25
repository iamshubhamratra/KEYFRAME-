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
const { validate, runInspect } = require("./validator");
const { runtimeCheck } = require("./runtime_check");
const { normalizeComposition, stripMissingAssets } = require("./normalize");
const { enrichComposition } = require("./enrich");
const frameRegistry = require("./frame_registry");
const { render } = require("./renderer");
const { buildFallback } = require("./fallback");
const { planAudio } = require("./audio_planner");
const { synthesize: ttsSynthesize } = require("./tts");
const { fetchMusic, fetchSfx } = require("./audio_sources");
const { mix: audioMix } = require("./audio_mix");
const { planAssets } = require("./asset_planner");
const { acquire } = require("./asset_sources");
const catalog = require("./catalog");

function jobDirFor(jobId) { return path.join(config.paths.jobsDir, jobId); }
function ms() { return Date.now(); }

// Mechanical fallback queries so a too-specific search degrades to a broader
// one instead of failing: drop the last word, then keep only the first two.
function fallbackQueriesFor(query) {
  const words = String(query).trim().split(/\s+/);
  const out = [];
  if (words.length >= 3) out.push(words.slice(0, -1).join(" "));
  if (words.length >= 2) out.push(words.slice(0, 2).join(" "));
  return [...new Set(out)].filter((q) => q !== query);
}

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
  tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "assets" });

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
        acquire({
          query: a.query, fallbackQueries: fallbackQueriesFor(a.query),
          type: "image", orientation, outputPath: absPath, tracker,
        })
          .then((got) => got ? {
            path: path.relative(jobDir, got.path).split(path.sep).join("/"), type: "image",
            sceneId: a.sceneId, startSec: a.startSec,
            durationSec: a.durationSec, style: a.style, alt: a.alt,
            license: got.license, sourceUrl: got.sourceUrl, source: got.source,
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
        acquire({
          query: a.query, fallbackQueries: fallbackQueriesFor(a.query),
          type: "video", orientation, outputPath: absPath, tracker,
        })
          .then((got) => got ? {
            path: path.relative(jobDir, got.path).split(path.sep).join("/"), type: "video",
            sceneId: a.sceneId, startSec: a.startSec,
            durationSec: a.durationSec, style: a.style,
            license: got.license, sourceUrl: got.sourceUrl, source: got.source,
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

// Normalize + install catalog blocks + lint + runtime-smoke one composer output.
// Returns { ok, feedback } — feedback is the next-lap repair brief when !ok.
async function gateComposition({ files, jobDir, tracker, label, enrich }) {
  // ENRICH FIRST — inject the deterministic anti-void background + always-on
  // animated vector/effects layer BEFORE normalize+lint, so the enriched HTML is
  // what gets validated and rendered, and reflowTrackOverlaps fixes any track
  // collision the injected clips introduce. Idempotent (skips if already done).
  if (enrich) {
    try {
      const en = enrichComposition(files.indexHtml, enrich);
      if (en.changed) {
        files.indexHtml = en.html;
        console.log(`[pipeline] enriched ${label}: +design-system background +animated vector layer`);
      }
    } catch (e) {
      console.warn(`[pipeline] enrichment skipped (${e.message.slice(0, 120)})`);
    }
  }

  const norm = normalizeComposition(files.indexHtml);
  if (norm.changed.length) {
    files.indexHtml = norm.html;
    console.log(`[pipeline] normalized ${label}: ${norm.changed.join(", ")}`);
  }

  // Backstop: drop any <img>/<video> pointing at a local file that wasn't
  // actually fetched (the composer occasionally invents 3.jpg/4.jpg) — prevents
  // broken/blank images and a wasted "missing asset" lint repair lap.
  const strip = stripMissingAssets(files.indexHtml, jobDir);
  if (strip.removed) {
    files.indexHtml = strip.html;
    console.log(`[pipeline] stripped ${strip.removed} <img>/<video> with a missing local src (${label})`);
  }

  try {
    const r = await catalog.installReferencedBlocks(files.indexHtml, jobDir);
    if (r.installed.length) tracker.addExternal("catalog_install");
    if (r.failed.length) console.warn(`[pipeline] catalog installs failed for: ${r.failed.join(", ")}`);
  } catch (e) {
    console.warn(`[pipeline] catalog install step threw: ${e.message}`);
  }

  tracker.addExternal("hyperframes_lint");
  const lint = await validate(jobDir, { indexHtml: files.indexHtml, metaJson: files.metaJson });
  if (!lint.ok) {
    console.warn(`[pipeline] hyperframes lint FAILED (${label}):\n${String(lint.stderr || lint.stdout || "(no output)").slice(-2000)}`);
    return { ok: false, feedback: `Previous HTML failed hyperframes lint with:\n${lint.stderr || lint.stdout}\nFix ONLY these specific issues and DO NOT introduce new lint violations (especially: keep clips on disjoint tracks, no overlapping clips on one track; use CSS opacity:0 for initial hidden state, never gsap.set() for it). Preserve everything that already passed.` };
  }

  // Static lint can't catch a script that THROWS at runtime (→ blank video).
  const rt = await runtimeCheck(jobDir).catch((e) => ({ ok: true, skipped: e.message }));
  if (!rt.ok) {
    console.warn(`[pipeline] composition lint-clean but FAILED runtime smoke (${label}): ${rt.error}`);
    return { ok: false, feedback: `Previous HTML passed structural lint but ${rt.error}. The composition MUST run without throwing AND register window.__timelines["vid"]. A common cause is misusing a GSAP function-based value: the callback signature is function(index, element, targets) — read the element from the 2nd argument; NEVER call this.target() (it is not a function). Fix the script so it executes cleanly end to end.` };
  }

  // Spatial layout audit (hyperframes inspect) — catches cards/text occluding
  // each other in SPACE, which lint (time-only) and runtime (does-it-throw) miss.
  // This is the gate for the "random overlapping cards" symptom. inspectOnly:true
  // marks a comp that is structurally/ runtime sound but has spatial overlaps —
  // the caller ships it on the final lap (a real comp beats the bland fallback).
  tracker.addExternal("hyperframes_inspect");
  const insp = await runInspect(jobDir).catch(() => ({ ok: true, skipped: true }));
  if (insp.ok) {
    console.log(`[pipeline] lint + runtime + spatial inspect passed (${label})${rt.skipped ? ` (smoke skipped)` : ""}${insp.skipped ? ` (inspect skipped)` : ""}`);
    return { ok: true };
  }
  const issueLines = insp.errors.slice(0, 12).map((i) =>
    `at ${i.time}s ${i.selector}${i.containerSelector ? ` (in ${i.containerSelector})` : ""}: ${i.message}${i.fixHint ? ` — ${i.fixHint}` : ""}`
  ).join("\n");
  console.warn(`[pipeline] spatial inspect FAILED (${label}): ${insp.errors.length} occlusion error(s)`);
  return {
    ok: false,
    inspectOnly: true,
    feedback: `Previous HTML passed lint + runtime but FAILED the spatial layout inspect — content is OVERLAPPING / OCCLUDING in space:\n${issueLines}\nFIX: lay sibling cards/panels/labels out in a flex or grid container with an explicit gap so they NEVER overlap; reserve position:absolute for decoratives only; give each scene's content its own zone. If a layer is intentionally stacked over another, add data-layout-allow-occlusion to it. Keep everything that already passed.`,
  };
}

async function composeWithLintRepair({ storyboard, dims, jobDir, availableAssets, tracker, abortSignal, framePack, captionCues }) {
  // First pass + up to N repair laps. Weaker/reasoning composer models often fix
  // the flagged errors on a repair but introduce a NEW class (e.g. nemotron clears
  // track overlaps, then trips gsap_set_initial_state) — a single lap can't
  // converge, so it falls back. Allow a few laps before escalating.
  const maxRepairs = Math.max(1, Number(config.llm.composerLintRepairs) || 2);

  let feedback = null;
  // Best lint+runtime-clean, occlusion-only lap (NORMALIZED, post-gate). Snapshot
  // it so that on exhaustion we ship the RICH asset-ful comp with only a residual
  // decorative overlap — never strip it. gateComposition writes each lap to disk,
  // so on exhaustion we must re-persist the best snapshot (a later regressing lap
  // may have overwritten index.html); render() reads jobDir/index.html.
  let bestInspectFiles = null;
  // Deterministic enrichment context (anti-void background + animated vector
  // layer), applied inside gateComposition before normalize+lint.
  const enrich = {
    width: dims.width, height: dims.height, duration: storyboard.durationSec,
    packTokens: framePack ? frameRegistry.getPackTokens(framePack) : null,
  };
  for (let lap = 0; lap <= maxRepairs; lap++) {
    const label = lap === 0 ? "first pass" : `repair ${lap}/${maxRepairs}`;
    console.log(`[pipeline] composeWithLintRepair: composer (${label})`);
    const sb = feedback ? { ...storyboard, __lintFeedback: feedback } : storyboard;
    let files;
    try {
      files = await compose(sb, {
        width: dims.width, height: dims.height, fps: dims.fps,
        duration: storyboard.durationSec,
        maxRetries: lap === 0 ? config.llm.composerMaxRetries : 1,
        availableAssets, abortSignal, framePack, captionCues,
      });
    } catch (e) {
      // A REPAIR lap that hard-fails (e.g. a transient 403/timeout on the
      // composer) must NOT discard a good earlier lap and collapse to the bland
      // deterministic template. If we already captured a lint+runtime-clean
      // (occlusion-only) composition, ship THAT — a real, rich comp with a
      // residual decorative overlap beats the fallback every time.
      if (lap > 0 && bestInspectFiles) {
        console.warn(`[pipeline] repair lap ${lap} compose failed (${String(e.message).slice(0, 140)}) — shipping best earlier lap instead of the bland fallback`);
        break;
      }
      throw e; // lap 0 failed with no good comp yet — let the caller fall back
    }
    tracker.addLlm({ inputTokens: files.tokensIn, outputTokens: files.tokensOut, stage: "composer" });

    const res = await gateComposition({ files, jobDir, tracker, label, enrich });
    if (res.ok) return { files };
    // inspectOnly => lint + runtime PASSED, only spatial overlap remains. Snapshot
    // the NORMALIZED html (gateComposition mutated files.indexHtml in place).
    if (res.inspectOnly && !bestInspectFiles) {
      bestInspectFiles = { indexHtml: files.indexHtml, metaJson: files.metaJson };
    }
    feedback = res.feedback;
    if (lap < maxRepairs) console.warn(`[pipeline] attempting repair (lap ${lap + 1}/${maxRepairs})`);
  }

  // Exhausted repair laps. Ship the BEST asset-ful, lint+runtime-clean,
  // occlusion-only lap — a rich comp with a residual decorative overlap beats the
  // bland fallback. Re-persist to disk: render() reads jobDir/index.html and a
  // later regressing lap may have overwritten it.
  if (bestInspectFiles) {
    fs.writeFileSync(path.join(jobDir, "index.html"), bestInspectFiles.indexHtml, "utf8");
    fs.writeFileSync(path.join(jobDir, "meta.json"), bestInspectFiles.metaJson, "utf8");
    console.warn(`[pipeline] shipping best asset-ful occlusion-only lap after ${maxRepairs} lap(s) — real comp beats fallback`);
    return { files: bestInspectFiles };
  }
  // A composition that still trips lint/runtime renders wrong or blank — worse
  // than the deterministic fallback. Let the caller escalate.
  throw new Error(`composition still failed gate after ${maxRepairs} repair lap(s): ${String(feedback || "").slice(-400)}`);
}

// ========== One attempt at full LLM comp + render with a given asset set ==========

async function attemptLlmComposition({ storyboard, dims, jobDir, assets, tracker, jobId, durationSec, label, abortSignal, framePack, captionCues }) {
  const t0 = ms();
  console.log(`[pipeline] ${label}: compose start (assets=${assets.length}, framePack=${framePack || "none"})`);
  await composeWithLintRepair({
    storyboard, dims, jobDir, availableAssets: assets, tracker, abortSignal, framePack, captionCues,
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
  tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "audio" });

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

// Move the freshly-mixed temp file over the original render. On Windows the
// just-rendered .mp4 can still be held open briefly (render finalize / AV scan),
// so a bare renameSync throws EPERM/EBUSY and silently drops all audio. Retry
// with backoff, then fall back to copy-over-delete (which tolerates an open dest
// on some handles), so a transient lock never loses the mix.
async function replaceFile(srcPath, destPath, { attempts = 6, delayMs = 200 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { fs.renameSync(srcPath, destPath); return; }
    catch (e) {
      lastErr = e;
      if (!["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  // Last resort: overwrite contents in place, then remove the temp.
  try {
    fs.copyFileSync(srcPath, destPath);
    try { fs.unlinkSync(srcPath); } catch { /* temp cleanup best-effort */ }
    return;
  } catch (e) {
    throw new Error(`could not replace ${path.basename(destPath)} after mix (${lastErr?.code || lastErr?.message}; copy fallback: ${e.message})`);
  }
}

async function mixAudioIntoVideo({ visualPath, durationSec, audio }) {
  if (!audio.ttsPath && !audio.musicPath && audio.sfx.length === 0) return false;
  const mixedPath = path.join(config.paths.videosDir, path.basename(visualPath) + ".tmp.mp4");
  await audioMix({
    videoPath: visualPath, outputPath: mixedPath, durationSec,
    ttsPath: audio.ttsPath, musicPath: audio.musicPath,
    musicVolume: audio.musicVolume, sfx: audio.sfx,
  });
  await replaceFile(mixedPath, visualPath);
  return true;
}

// ========== Main ==========

async function runJob({
  jobId, prompt, duration, orientation, width, height, fps,
  tts = false, music = false, soundEffect = false, voice,
  images = false, video = false, framePack = null,
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
      tracker.addLlm({ inputTokens: sbRes.tokensIn, outputTokens: sbRes.tokensOut, stage: "storyboard" });
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
            label: "main", abortSignal: signal, framePack,
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
            label: "no-videos", abortSignal: signal, framePack,
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

    // ---- Attempt 3 REMOVED ----
    // The old no-assets recompose STRIPPED ALL images on any failure and shipped a
    // barren slideshow — the direct cause of "lack of images/assets" videos. It is now
    // redundant: occlusion-exhaustion ships the best asset-ful occlusion-only lap (see
    // composeWithLintRepair), and lint/runtime exhaustion falls to buildFallback below,
    // which KEEPS the photos (assets: allAssets). Images are never stripped to clear overlap.

    // ---- Attempt 4: polished deterministic fallback ----
    if (!visualResult) {
      const t0 = ms();
      finalAttempt = "fallback";
      usedFallback = true;
      const fb = buildFallback({
        prompt, duration, orientation, width, height, fps,
        storyboard: sbRes.storyboard,
        packTokens: framePack ? require("./frame_registry").getPackTokens(framePack) : null,
        assets: allAssets,
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

module.exports = { runJob, withBudget, attemptLlmComposition, mixAudioIntoVideo, fallbackQueriesFor };
