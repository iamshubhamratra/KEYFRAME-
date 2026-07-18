// KEYFRAME project pipeline — the two-act flow with the script checkpoint.
//
//   Act 1  runIntake():    intent -> brief -> draft script -> PAUSE (script_review)
//   Act 2  runProduction(): approved script -> storyboard -> compose (frame pack)
//                           -> render -> VO/music from the script -> mix -> done
//
// The pause is the product's signature: the user edits voiceover lines, scene
// durations, and asset queries in the Script Room, then approves. With
// autopilot the approve step is automatic.
//
// Act 2 reuses the v1 pipeline's battle-tested pieces (withBudget,
// attemptLlmComposition, mixAudioIntoVideo) rather than reimplementing them.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const { UsageTracker } = require("./usage");
const { checkBudget, BUDGET_EXHAUSTED_MSG } = require("./openrouter");
const { generateBrief } = require("./brief");
const { generateScript, validateScript, normalizeScript } = require("./script");
const { understandWebsite } = require("./ingest/website");
const { understandBlog } = require("./ingest/blog");
const { transcribeVideo } = require("./ingest/transcribe");
const { generateStoryboard } = require("./storyboard");
const { buildFallback } = require("./fallback");
const { synthesizeFitted } = require("./vo_fit");
const { buildCues, writeSrt } = require("./captions");
const { fetchMusic, fetchSfx } = require("./audio_sources");
const { VALID_VOICES } = require("./audio_planner");
const { render } = require("./renderer");
const { withBudget, attemptLlmComposition, mixAudioIntoVideo, fallbackQueriesFor, retimeScenesToVo } = require("./pipeline");
const { acquire, hasProviderFor } = require("./asset_sources");
const { captureTopicShots, mergeShots } = require("./screenshot_director");
const { blogImageAssets } = require("./blog_assets");
const { qaGateScreenshots } = require("./screenshot_qa");

function jobDirFor(jobId) { return path.join(config.paths.jobsDir, jobId); }
function ms() { return Date.now(); }

// ---------- Act 1: intake ----------

async function runIntake({ jobId, onApproved, skipBrief = false }) {
  const job = db.getRaw(jobId);
  if (!job) return;

  // Fail fast and legibly when the daily LLM budget is gone — a silent
  // fallback video with no voice is worse than an honest error.
  const budget = await checkBudget();
  if (budget && budget.remaining !== null && budget.remaining < 0.15) {
    console.warn(`[project] ${jobId} blocked: $${budget.remaining} of $${budget.limit} daily budget remaining`);
    db.markFailed(jobId, BUDGET_EXHAUSTED_MSG);
    return;
  }

  const tracker = new UsageTracker();
  const timings = {};
  db.markStarted(jobId);

  try {
    const intent = job.intent || {
      prompt: job.prompt,
      preferences: {
        duration: job.duration,
        orientation: job.orientation,
        voiceStyle: job.voice_style || "auto",
        framePack: job.frame_pack || "auto",
      },
    };

    // ---- Multi-modal ingest: website + reference video, in parallel.
    // Each worker degrades to null on failure — a dead URL must not kill the
    // project when a prompt is also present.
    if ((intent.websiteUrl || intent.blogUrl || job.upload_path) && !intent.__ingested) {
      const t0 = ms();
      db.setProgress(jobId, "ingest");
      const workDir = path.join(jobDirFor(jobId), "ingest");

      // Blog mode reuses the website worker ON THE POST URL for the hero
      // screenshot + brand colors, while the blog worker reads the article
      // itself (text, sections, its own images) in parallel.
      const shotUrl = intent.websiteUrl || intent.blogUrl;
      const websiteTask = shotUrl
        ? understandWebsite({ url: shotUrl, workDir, timeoutMs: config.ingest?.websiteTimeoutMs || 60_000 })
            .catch((e) => { console.warn(`[project] website ingest failed: ${e.message}`); return null; })
        : Promise.resolve(null);

      const blogTask = intent.blogUrl
        ? understandBlog({ url: intent.blogUrl, workDir: path.join(workDir, "blog"), timeoutMs: config.ingest?.websiteTimeoutMs || 60_000 })
            .catch((e) => { console.warn(`[project] blog ingest failed: ${e.message}`); return null; })
        : Promise.resolve(null);

      const videoTask = job.upload_path
        ? transcribeVideo({ videoPath: job.upload_path, workDir, tracker })
            .catch((e) => { console.warn(`[project] video ingest failed: ${e.message}`); return null; })
        : Promise.resolve(null);

      const [website, blog, video] = await Promise.all([websiteTask, blogTask, videoTask]);
      if (website) {
        intent.website = {
          url: website.url, title: website.title, description: website.description,
          headings: website.headings, bodyText: website.bodyText,
          brandColors: website.brandColors, ogImage: website.ogImage,
          hasRealScreenshots: (website.screenshotPaths || []).length,
        };
        job.website_screenshot = website.screenshotPath;
        job.website_screenshots = website.screenshotPaths || (website.screenshotPath ? [website.screenshotPath] : []);
        job.website_title = website.title;
        // Internal link map for the Screenshot Director (topic-matched page
        // captures at production time). Persisted with the job like the shots.
        job.website_pages = website.pageLinks || [];
        // Auth-wall flag: tells the director to rescue via the product's PUBLIC
        // marketing site (claude.ai login wall -> claude.com) instead of giving up.
        job.website_auth_wall = !!website.isAuthWall;
      }
      if (blog) {
        // The article itself, for the brief/script: the film is a companion
        // piece that SUMMARIZES this post (excerpt bounded so prompts stay sane).
        intent.blog = {
          url: blog.url, title: blog.title, author: blog.author || null,
          published: blog.published || null, headings: blog.headings,
          excerpt: String(blog.text || "").slice(0, 6000),
          imageCount: blog.images.length,
        };
        job.blog_url = blog.url;
        job.blog_title = blog.title;
        // The post's own images (downloaded at ingest) become pinned
        // owner-content assets at production time (blog_assets.js).
        job.blog_images = blog.images;
      }
      if (video) intent.video = video;
      // Mark ingest "done" ONLY when a worker actually produced signal. Caching a
      // transient website/transcribe failure as done would permanently strip the
      // real screenshots / brand colors / transcript on every later regenerate;
      // leaving it unset lets the next run retry and recover the on-brand assets.
      if (website || blog || video) intent.__ingested = true;
      job.intent = intent; // persist enriched intent for regenerate runs
      timings.ingestMs = ms() - t0;

      if (!intent.prompt && !website && !blog && !video) {
        throw new Error("ingest produced no usable signal (prompt empty, website/blog/video ingest all failed)");
      }
    }

    const intakeBudgetMs = (Number(config.server.stageBudgetSec) || 480) * 1000;

    let brief;
    if (skipBrief && job.brief) {
      brief = job.brief; // regenerate-script keeps the existing brief
    } else {
      const t0 = ms();
      db.setProgress(jobId, "brief");
      const briefRes = await withBudget((signal) => generateBrief({ intent, signal }), intakeBudgetMs, "brief stage");
      tracker.addLlm({ inputTokens: briefRes.tokensIn, outputTokens: briefRes.tokensOut, stage: "brief" });
      timings.briefMs = ms() - t0;
      brief = briefRes.brief;
    }

    // The user's explicit duration wins over the model's suggestion.
    if (job.duration) brief.suggestedDuration = job.duration;

    const tScript = ms();
    db.setProgress(jobId, "script");
    const scriptRes = await withBudget((signal) => generateScript({ brief, signal }), intakeBudgetMs, "script stage");
    tracker.addLlm({ inputTokens: scriptRes.tokensIn, outputTokens: scriptRes.tokensOut, stage: "script" });
    timings.scriptMs = ms() - tScript;

    db.markScriptReview(jobId, {
      brief,
      script: scriptRes.script,
      warnings: scriptRes.warnings,
      framePack: brief.suggestedFramePack,
      usage: tracker.computeCosts(),
      stageTimings: timings,
    });
    console.log(`[project] ${jobId} intake done — ${scriptRes.script.scenes.length} scenes, paused at script_review (autopilot=${!!job.autopilot})`);

    if (job.autopilot) {
      db.markApproved(jobId, { script: scriptRes.script });
      if (onApproved) onApproved(jobId);
    }
  } catch (err) {
    console.error(`[project] ${jobId} intake failed: ${err.message}`);
    const costs = tracker.computeCosts();
    db.markFailed(jobId, err.message.slice(0, 2000), costs.llm.inputTokens, costs.llm.outputTokens, costs, timings);
  }
}

// ---------- Act 2: production ----------

// The storyboard stage still speaks "prompt" — feed it a structured digest of
// the approved script so scene boundaries, VO, and on-screen text line up.
// (Phase 5 upgrades storyboard.js to consume the script natively with beats.)
function storyboardPromptFromScript(script, brief) {
  const lines = [
    `Produce this exact video: "${script.title}".`,
    brief ? `Context: ${brief.improvedPrompt}` : "",
    "",
    "Scene-by-scene plan (FOLLOW these timings and contents exactly — same number of scenes, same start/duration):",
  ];
  for (const s of script.scenes) {
    lines.push(
      `- Scene ${s.id} [${s.start}s + ${s.duration}s] (${s.purpose}): ` +
      `${s.visualDirection} ` +
      (s.onScreenText.length ? `On-screen text: ${s.onScreenText.map((t) => `"${t}"`).join(", ")}. ` : "") +
      (s.voiceover ? `Narration meanwhile: "${s.voiceover}"` : "No narration.")
    );
  }
  return lines.join("\n");
}

function pickVoice(job, script) {
  const want = (job.voice_style || script?.voice?.style || "").toLowerCase();
  for (const v of VALID_VOICES) {
    if (want.includes(v)) return v;
  }
  return "marin";
}

// REAL website screenshots captured at ingest become first-class assets,
// pinned to the scenes that showcase the product (feature/proof/how) so the
// composer gives them the device-frame hero treatment.
function screenshotAssets({ job, script, jobDir }) {
  const shots = (job.website_screenshots || []).filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (!shots.length) return [];

  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  const showcaseScenes = script.scenes.filter((s) => ["feature", "proof", "how", "context"].includes(s.purpose));
  const fallbackScenes = script.scenes.slice(1, -1);
  const targets = (showcaseScenes.length ? showcaseScenes : fallbackScenes).slice(0, 3);
  const title = job.website_title || "the product";

  return shots.slice(0, targets.length).map((src, i) => {
    const relPath = `assets/images/site_${i}.png`;
    fs.copyFileSync(src, path.join(jobDir, relPath));
    const scene = targets[i];
    return {
      path: relPath,
      type: "image",
      sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
      style: "inset",
      alt: `REAL website screenshot of ${title} (${i === 0 ? "homepage hero" : `page section ${i + 1}`}) — present in a styled browser frame with hero treatment`,
      license: "owner content", sourceUrl: job.intent?.websiteUrl || null, source: "website",
      fromCache: false,
    };
  });
}

// Acquire the approved script's assetNeeds (our DB first, then providers).
// Caps: 6 searched assets + up to 3 real screenshots, at most 1 video.
// Returns the availableAssets manifest the composer sees.
async function acquireScriptAssets({ job, script, jobDir, orientation, tracker }) {
  // Screenshot Director: topic-matched INTERNAL page captures (pricing scene ->
  // /pricing shot) run in parallel with everything below; merged at the end.
  const topicTask = captureTopicShots({
    job, script, jobDir,
    topic: (job.brief && job.brief.subject) || job.website_title || "",
    tracker,
  }).catch(() => []);
  const pinned = screenshotAssets({ job, script, jobDir });

  const wanted = [];
  const videoOk = hasProviderFor("video");
  const screenshotScenes = new Set(pinned.map((a) => a.sceneId));
  for (const scene of script.scenes) {
    for (const need of scene.assetNeeds || []) {
      // A scene that already has a real screenshot doesn't need a stock
      // background competing with it.
      if (screenshotScenes.has(scene.id) && need.role === "background") continue;
      // No video provider configured (keys missing)? A still works almost as
      // well as a loop for backgrounds — downgrade rather than come up empty.
      if (need.type === "video" && !videoOk) {
        wanted.push({ scene, need: { ...need, type: "image" } });
      } else {
        wanted.push({ scene, need });
      }
    }
  }
  if (!wanted.length && !pinned.length) {
    return qaGateScreenshots({
      assets: mergeShots(await topicTask, []), jobDir,
      subject: (job.brief && job.brief.subject) || job.website_title || "", tracker,
    });
  }

  const videos = wanted.filter((w) => w.need.type === "video").slice(0, 1);
  const images = wanted.filter((w) => w.need.type !== "video").slice(0, 6 - videos.length);
  const picks = [...videos, ...images];

  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "assets", "videos"), { recursive: true });

  let iImg = 0, iVid = 0;
  const tasks = picks.map(({ scene, need }) => {
    const isVideo = need.type === "video";
    const relPath = isVideo ? `assets/videos/${iVid++}.mp4` : `assets/images/${iImg++}.jpg`;
    const query = need.type === "icon" ? `${need.query} icon flat` : need.query;
    return acquire({
      query,
      fallbackQueries: fallbackQueriesFor(query),
      type: isVideo ? "video" : "image",
      orientation,
      outputPath: path.join(jobDir, relPath),
      tracker,
    })
      .then((got) => got ? {
        path: relPath,
        type: isVideo ? "video" : "image",
        sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
        style: need.role === "inset" ? "inset" : "background",
        alt: need.query,
        license: got.license, sourceUrl: got.sourceUrl, source: got.source,
        fromCache: got.fromCache === true,
      } : null)
      .catch(() => null);
  });

  const got = (await Promise.all(tasks)).filter(Boolean);
  // Topic page shots claim their scenes; the landing pins fill the rest.
  // SCREENSHOT QA — vision-inspect every capture and drop broken ones (error
  // pages, consent modals, bot-walls, blanks) before the composer sees them.
  const shots = await qaGateScreenshots({
    assets: mergeShots(await topicTask, pinned), jobDir,
    subject: (job.brief && job.brief.subject) || job.website_title || "", tracker,
  });
  // Blog mode: the post's own images join as pinned owner-content assets on
  // scenes the screenshots didn't claim.
  const blogPins = blogImageAssets({ job, script, jobDir, skipSceneIds: new Set(shots.map((a) => String(a.sceneId))) });
  console.log(`[project] assets: ${shots.length} real screenshot(s) (${shots.filter((a) => /page_/.test(a.path)).length} topic-matched) + ${blogPins.length} blog image(s) + ${got.length}/${picks.length} acquired (${got.filter((a) => a.fromCache).length} from cache)`);
  return [...shots, ...blogPins, ...got];
}

async function runProduction({ jobId }) {
  const job = db.getRaw(jobId);
  if (!job || !job.script) {
    console.error(`[project] ${jobId} production aborted: no approved script`);
    return;
  }

  const budget = await checkBudget();
  if (budget && budget.remaining !== null && budget.remaining < 0.15) {
    console.warn(`[project] ${jobId} production blocked: $${budget.remaining} of $${budget.limit} daily budget remaining`);
    db.markFailed(jobId, BUDGET_EXHAUSTED_MSG);
    return;
  }

  const jobDir = jobDirFor(jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const tracker = new UsageTracker();
  const timings = job.stage_timings ? { ...job.stage_timings } : {};
  const markStage = (name, startAt) => { timings[name + "Ms"] = ms() - startAt; };

  db.markStarted(jobId);
  const script = normalizeScript(job.script, { targetDuration: job.duration });
  const brief = job.brief;
  const framePack = job.frame_pack || null;
  const duration = job.duration;
  const dims = { width: job.width, height: job.height, fps: job.fps };

  let usedFallback = false;
  let finalAttempt = "main";
  let visualResult = null;
  let voClips = [];               // measured narration clips, pinned to re-timed scene starts
  let startMap = new Map();       // old script scene start -> re-timed start (sfx re-pinning)
  let effectiveDuration = duration; // grows when scenes stretch to fit their narration

  try {
    // ---- Audio starts immediately, in parallel with the visual chain.
    // VO is synthesized PER SCENE from the approved script's exact lines and
    // later mixed at each scene's offset — this is what makes captions and
    // timing-true narration possible. vo_fit tightens any line that overruns
    // its scene by >10% (one LLM rewrite, then re-synth).
    const audioDir = path.join(jobDir, "audio");
    fs.mkdirSync(audioDir, { recursive: true });
    const voice = pickVoice(job, script);
    const voInstructions = `${script.voice.style}. Pace: ${script.voice.pace}.`;

    // One shared ttsSession = one narrator across all clips of this job.
    const ttsSession = {};
    const voTask = Promise.all(script.scenes.map((s) =>
      (s.voiceover && s.voiceover.trim())
        ? synthesizeFitted({
            text: s.voiceover, targetSec: s.duration, voice,
            instructions: voInstructions,
            outputPath: path.join(audioDir, `vo-${s.id}.mp3`),
            tracker, session: ttsSession,
          })
            .then((r) => r ? { sceneId: s.id, startSec: s.start, durationSec: r.durationSec, sceneDurationSec: s.duration, text: r.text, path: r.path } : null)
            .catch((e) => { console.warn(`[project] vo for ${s.id} failed: ${e.message}`); return null; })
        : Promise.resolve(null)
    )).then((arr) => arr.filter(Boolean));

    // Sound effects from the script's per-scene sfx[] — fetched in parallel,
    // landed at each scene's start, mixed under the VO.
    const sfxWanted = [];
    for (const s of script.scenes) {
      for (const name of (s.sfx || [])) {
        if (sfxWanted.length < 6) sfxWanted.push({ query: name, startSec: s.start });
      }
    }
    const sfxTask = Promise.all(sfxWanted.map((s, i) =>
      fetchSfx({ query: s.query, outputPath: path.join(audioDir, `sfx-${i}.mp3`), tracker })
        .then((p) => p ? { path: p, startSec: s.startSec, volume: 0.4 } : null)
        .catch(() => null)
    )).then((arr) => arr.filter(Boolean));

    const musicTask = script.music?.query
      ? fetchMusic({ query: script.music.query, outputPath: path.join(audioDir, "music.mp3"), tracker })
          .catch((e) => { console.warn(`[project] music failed: ${e.message}`); return null; })
      : Promise.resolve(null);

    // ---- Assets (DB-first) start now, in parallel with the storyboard call.
    const assetsTask = acquireScriptAssets({ job, script, jobDir, orientation: job.orientation, tracker })
      .catch((e) => { console.warn(`[project] asset stage failed: ${e.message}`); return []; });

    // ---- Storyboard from the approved script ----
    {
      const t0 = ms();
      db.setProgress(jobId, "storyboard");
      const sbPrompt = storyboardPromptFromScript(script, brief);
      const sbRes = await generateStoryboard({ prompt: sbPrompt, duration, orientation: job.orientation });
      tracker.addLlm({ inputTokens: sbRes.tokensIn, outputTokens: sbRes.tokensOut, stage: "storyboard" });
      markStage("storyboard", t0);

      db.setProgress(jobId, "assets");
      const assets = await assetsTask;
      db.setAssets(jobId, assets);

      // ---- VO-DRIVEN RE-TIMING (the sync fix, ported from /generate) ----
      // Await the measured narration BEFORE composing and stretch each scene to
      // contain its line. Without this, a 3.4s line in a 3s scene overlapped the
      // next scene's narration AND the last line ran past the video end and was
      // CUT MID-SENTENCE at mux time. VO synthesis started in parallel with the
      // storyboard + assets above, so most of its latency is already absorbed.
      voClips = await voTask;
      const retime = retimeScenesToVo(sbRes.storyboard, script, voClips);
      startMap = retime.startMap;
      if (retime.effectiveDuration > 0) effectiveDuration = retime.effectiveDuration;
      if (effectiveDuration > duration + 0.05) {
        console.log(`[project] scenes re-timed to measured VO: ${duration}s -> ${effectiveDuration}s (last line no longer cut)`);
      }

      // Caption cues for ON-SCREEN baking, built from the RE-TIMED scene starts.
      const captionCues = job.captions_enabled === 0 ? [] : buildCues(
        script.scenes
          .filter((s) => s.voiceover && s.voiceover.trim())
          .map((s) => {
            const measured = voClips.find((c) => String(c.sceneId) === String(s.id));
            return {
              sceneId: s.id,
              startSec: s.start,
              durationSec: Math.min(s.duration, measured ? measured.durationSec : s.duration),
              sceneDurationSec: s.duration,
              text: s.voiceover,
            };
          })
      ).map((c) => ({ start: Math.round(c.start * 10) / 10, end: Math.round(c.end * 10) / 10, text: c.text }));

      // ---- Compose + render (frame-pack styled), with the v1 budget wrapper.
      // Tier 1: with assets. Tier 2: asset-less. Tier 3: deterministic fallback.
      const budget = (Number(config.server.stageBudgetSec) || 240) * 1000;
      // Explicit premium finish → the LLM composer (bespoke page), with the
      // STRICT identity gate when the user also pinned the template.
      const remix = job.compose_mode === "premium";
      const strictIdentity = remix && (job.frame_pack_user === 1 || job.frame_pack_user === true);
      const t1 = ms();
      db.setProgress(jobId, "composing");
      try {
        visualResult = await withBudget(
          (signal) => attemptLlmComposition({
            storyboard: sbRes.storyboard, dims, jobDir,
            assets, tracker, jobId, durationSec: effectiveDuration,
            label: "project-main", abortSignal: signal, framePack, captionCues,
            remix, strictIdentity,
          }),
          budget, "project composition"
        );
        markStage("compose_render", t1);
      } catch (e1) {
        markStage("compose_render", t1);
        console.warn(`[project] composition failed (${e1.message.slice(0, 200)})`);
        if (assets.length) {
          finalAttempt = "no-assets";
          const t2 = ms();
          try {
            visualResult = await withBudget(
              (signal) => attemptLlmComposition({
                storyboard: sbRes.storyboard, dims, jobDir,
                assets: [], tracker, jobId, durationSec: effectiveDuration,
                label: "project-no-assets", abortSignal: signal, framePack, captionCues,
                remix, strictIdentity,
              }),
              budget, "project no-assets retry"
            );
            markStage("retry_no_assets", t2);
          } catch (e2) {
            markStage("retry_no_assets", t2);
            console.warn(`[project] asset-less retry failed (${e2.message.slice(0, 200)})`);
          }
        }
        if (!visualResult) {
          console.warn(`[project] using deterministic fallback`);
          finalAttempt = "fallback";
          usedFallback = true;
          // Preserve the LLM composition for debugging/salvage — the
          // fallback is about to overwrite index.html.
          try {
            if (fs.existsSync(path.join(jobDir, "index.html"))) {
              fs.copyFileSync(path.join(jobDir, "index.html"), path.join(jobDir, "index.llm-attempt.html"));
            }
          } catch { /* best effort */ }
          const fb = buildFallback({
            prompt: brief?.improvedPrompt || job.prompt, duration: effectiveDuration,
            orientation: job.orientation, width: dims.width, height: dims.height, fps: dims.fps,
            storyboard: sbRes.storyboard,
            packTokens: framePack ? require("./frame_registry").getPackTokens(framePack) : null,
          });
          fs.writeFileSync(path.join(jobDir, "index.html"), fb.indexHtml, "utf8");
          fs.writeFileSync(path.join(jobDir, "meta.json"), fb.metaJson, "utf8");
          tracker.addExternal("hyperframes_render");
          visualResult = await render({ jobId, jobDir, durationSec: effectiveDuration });
        }
      }
    }

    // ---- Mix audio: per-scene VO clips at their offsets + ducked music ----
    {
      const t0 = ms();
      db.setProgress(jobId, "audio");
      const [musicPath, sfxClips] = await Promise.all([musicTask, sfxTask]);
      const r2c = (n) => Math.round(Number(n) * 100) / 100;
      const sfxRepinned = sfxClips.map((c) => ({ ...c, startSec: startMap.get(r2c(c.startSec)) ?? c.startSec }));
      if (sfxRepinned.length) console.log(`[project] ${sfxRepinned.length} sfx mixed in`);

      // Captions: cue objects + .srt exported next to the MP4.
      const cues = buildCues(voClips);
      if (cues.length) {
        try {
          const srtPath = path.join(config.paths.videosDir, `${jobId}.srt`);
          writeSrt(cues, srtPath);
          db.setCaptions(jobId, { cues, srtUrl: `/videos/${jobId}.srt` });
        } catch (e) {
          console.warn(`[project] srt write failed: ${e.message}`);
        }
      }

      await mixAudioIntoVideo({
        visualPath: visualResult.videoPath,
        durationSec: effectiveDuration,
        scenes: sbRes.storyboard?.scenes || null, jobDir,
        audio: {
          ttsPath: null,
          musicPath,
          // VO clips and sound effects both ride the mixer's offset mechanism.
          // kind:"vo" routes narration through the voice bus (cleanup + full level)
          // and keys the ducking — without it the mixer treats speech as an SFX.
          sfx: [
            ...voClips.map((c) => ({ path: c.path, startSec: c.startSec, volume: 1.0, kind: "vo" })),
            ...sfxRepinned,
          ],
          musicVolume: config.audio?.defaultMusicVolume ?? 0.15,
        },
      }).catch((e) => console.warn(`[project] mix failed: ${e.message}`));
      markStage("audio", t0);
    }

    db.setProgress(jobId, "finalizing");
    const costs = tracker.computeCosts();
    db.markDone(jobId, {
      videoUrl: visualResult.videoUrl,
      usedFallback,
      tokensIn: costs.llm.inputTokens,
      tokensOut: costs.llm.outputTokens,
      usage: costs,
      stageTimings: timings,
      finalAttempt,
    });
    const ttsTok = (costs.tts.inputTokensEst || 0) + (costs.tts.outputTokensEst || 0);
    const totalTok = costs.llm.inputTokens + costs.llm.outputTokens + ttsTok;
    console.log(
      `[project] ${jobId} done — attempt=${finalAttempt}, ` +
      `tokens=${totalTok.toLocaleString()} (LLM ${costs.llm.inputTokens.toLocaleString()} in / ${costs.llm.outputTokens.toLocaleString()} out over ${costs.llm.callCount} calls, TTS ${ttsTok.toLocaleString()}), ` +
      `cost=$${costs.totalCostUsd}`
    );
    if (costs.byStage?.length) {
      const perStage = costs.byStage
        .map((s) => `${s.stage} ${s.totalTokens.toLocaleString()}tok×${s.callCount} $${s.costUsd}`)
        .join("  |  ");
      console.log(`[project] ${jobId} per-stage: ${perStage}`);
    }
  } catch (err) {
    console.error(`[project] ${jobId} production failed: ${err.message}`);
    const costs = tracker.computeCosts();
    const totalTok = costs.llm.inputTokens + costs.llm.outputTokens
      + (costs.tts.inputTokensEst || 0) + (costs.tts.outputTokensEst || 0);
    console.log(`[project] ${jobId} FAILED — tokens=${totalTok.toLocaleString()} consumed before failure, cost=$${costs.totalCostUsd}`);
    db.markFailed(jobId, err.message.slice(0, 2000), costs.llm.inputTokens, costs.llm.outputTokens, costs, timings);
  }
}

module.exports = { runIntake, runProduction, validateScript, normalizeScript };
