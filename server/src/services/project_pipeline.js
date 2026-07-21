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
const { transcribeVideo } = require("./ingest/transcribe");
const { generateStoryboard } = require("./storyboard");
const { buildFallback } = require("./fallback");
const { synthesizeFitted } = require("./vo_fit");
const { buildCues, writeSrt, writeVtt } = require("./captions");
const { resolveCaptionPlan, finalizeQuality, localizeStoryboardText } = require("./caption_director");
const { injectCaptionStyle } = require("./caption_render");
const { fetchMusic, fetchSfx } = require("./audio_sources");
const { VALID_VOICES } = require("./audio_planner");
const { render } = require("./renderer");
const { withBudget, attemptLlmComposition, mixAudioIntoVideo, fallbackQueriesFor, composerStringsFor } = require("./pipeline");
const { acquire, hasProviderFor } = require("./asset_sources");
const { reviewAndCurate } = require("./creative_director");
const { directAudio } = require("./audio_director");
const { pinUserAssets, prepareUserAssets, inventoryForScript } = require("./user_assets");
const { coverageFromHtml } = require("./asset_coverage");
const { scoreBrandCoverage } = require("./brand_coverage");

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

    // ---- USER ASSET PRIORITY (intake half): probe + classify the user's own
    // uploads ONCE, before the brief/script, so the script model can plan
    // showcase scenes around the actual inventory. Started here so it runs in
    // parallel with the website/video ingest below; awaited before the brief.
    // OUTSIDE the __ingested gate on purpose: a transient classification failure
    // (classified:false survives) retries on regenerate even when the website
    // ingest already cached itself as done.
    const userAssetTask = (job.user_assets || []).some((u) => u && u.classified !== true)
      ? prepareUserAssets({ job, jobDir: jobDirFor(jobId), subject: intent.prompt || intent.websiteUrl || null, tracker })
          .catch((e) => { console.warn(`[project] user-asset classification failed: ${e.message}`); return null; })
      : Promise.resolve(null);

    // ---- Multi-modal ingest: website + reference video, in parallel.
    // Each worker degrades to null on failure — a dead URL must not kill the
    // project when a prompt is also present.
    if ((intent.websiteUrl || job.upload_path) && !intent.__ingested) {
      const t0 = ms();
      db.setProgress(jobId, "ingest");
      const workDir = path.join(jobDirFor(jobId), "ingest");

      const websiteTask = intent.websiteUrl
        ? understandWebsite({ url: intent.websiteUrl, workDir, timeoutMs: config.ingest?.websiteTimeoutMs || 60_000 })
            .catch((e) => { console.warn(`[project] website ingest failed: ${e.message}`); return null; })
        : Promise.resolve(null);

      const videoTask = job.upload_path
        ? transcribeVideo({ videoPath: job.upload_path, workDir, tracker })
            .catch((e) => { console.warn(`[project] video ingest failed: ${e.message}`); return null; })
        : Promise.resolve(null);

      const [website, video] = await Promise.all([websiteTask, videoTask]);
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

        // SCREENSHOT INTELLIGENCE (deterministic intake prune): drop blank/low-info
        // and near-duplicate shots BEFORE they become assets. This is the single
        // upstream wiring point — both the legacy screenshotAssets and the graph
        // assetSearchAgent read job.website_screenshots, so cleaning it once feeds
        // both pipelines. Fail-open: any error keeps the original list untouched.
        if (config.screenshotIntelligence?.enabled && job.website_screenshots.length) {
          try {
            const { filterScreenshots } = require("./screenshot_intake");
            const { keptShots, review } = await filterScreenshots({ shots: job.website_screenshots });
            job.website_screenshots = keptShots.map((s) => s.path);
            if (website.isAuthWall) review.suppressed.push("auth-wall");
            db.setScreenshotReview(jobId, review);
            if (review.dropped.length) console.log(`[project] screenshot intelligence: kept ${review.kept}/${review.captured} (dropped ${review.dropped.map((d) => d.reason).join(", ")})`);
          } catch (e) { console.warn(`[project] screenshot intake skipped: ${e.message}`); }
        } else if (config.screenshotIntelligence?.enabled && website.isAuthWall) {
          // No usable shots but a real auth wall — disclose why the film uses stock.
          db.setScreenshotReview(jobId, { captured: 0, kept: 0, dropped: [], suppressed: ["auth-wall"], notes: ["The site is behind a sign-in wall, so its screens can't be shown — the film uses stock/brand visuals instead."] });
        }
      }
      if (video) intent.video = video;
      // Mark ingest "done" ONLY when a worker actually produced signal. Caching a
      // transient website/transcribe failure as done would permanently strip the
      // real screenshots / brand colors / transcript on every later regenerate;
      // leaving it unset lets the next run retry and recover the on-brand assets.
      if (website || video) intent.__ingested = true;
      job.intent = intent; // persist enriched intent for regenerate runs
      timings.ingestMs = ms() - t0;

      if (!intent.prompt && !website && !video) {
        throw new Error("ingest produced no usable signal (prompt empty, website and video ingest both failed)");
      }
    }

    // Land the classified manifest before the brief so intent carries the
    // inventory (the brief prompt serializes the whole intent object).
    const userManifest = await userAssetTask;
    if (userManifest) {
      db.setUserAssets(jobId, userManifest);
      job.user_assets = userManifest;
      intent.userAssets = {
        count: userManifest.filter((u) => u && u.role !== "logo").length,
        hasLogo: userManifest.some((u) => u && u.role === "logo"),
        inventory: inventoryForScript(userManifest),
        types: userManifest.filter((u) => u && u.role !== "logo").map((u) => u.assetType || "other"),
      };
      // LOGO -> THEME: quantize the uploaded logo's own brand colors (same ffmpeg
      // quantizer the website hero uses — dominantColors takes any path). These seed
      // the Art Director ABOVE website-extracted colors (the logo is the authored
      // mark, not photography). Fail-open: a monochrome/failed logo yields [] and the
      // precedence simply falls through.
      const logoEntry = userManifest.find((u) => u && u.role === "logo" && u.path);
      if (logoEntry) {
        try {
          const { dominantColors } = require("./ingest/website");
          const cols = await dominantColors(path.join(jobDirFor(jobId), logoEntry.path)).catch(() => []);
          if (Array.isArray(cols) && cols.length) {
            intent.logo = { brandColors: cols };
            console.log(`[project] logo colors extracted: ${cols.join(",")}`);
          }
        } catch (e) { console.warn(`[project] logo color extraction skipped: ${e.message}`); }
      }
      job.intent = intent;
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
    const scriptRes = await withBudget((signal) => generateScript({ brief, userAssets: intent.userAssets || null, signal }), intakeBudgetMs, "script stage");
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
function screenshotAssets({ job, script, jobDir, excludeSceneIds = new Set(), max = 3 }) {
  const shots = (job.website_screenshots || []).filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (!shots.length) return [];

  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  const showcaseScenes = script.scenes.filter((s) => ["feature", "proof", "how", "context"].includes(s.purpose));
  const fallbackScenes = script.scenes.slice(1, -1);
  const targets = (showcaseScenes.length ? showcaseScenes : fallbackScenes)
    .filter((s) => !excludeSceneIds.has(s.id))
    .slice(0, max);
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
  // USER UPLOADS lead (tier 100) — pinned by reference from jobs/<id>/uploads/.
  // Website screenshots then fill the showcase scenes the uploads did not take,
  // and fewer of them when uploads exist (the user's material is the show).
  const userPins = await pinUserAssets({ job, script, jobDir, maxPins: 6 });
  const pinned = [
    ...userPins.pinned,
    ...(userPins.logoAsset ? [userPins.logoAsset] : []),
    ...screenshotAssets({ job, script, jobDir, excludeSceneIds: userPins.usedSceneIds, max: userPins.pinned.length ? 2 : 3 }),
  ];

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
  if (!wanted.length && !pinned.length) return [];

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
  console.log(`[project] assets: ${pinned.length} real screenshot(s) + ${got.length}/${picks.length} acquired (${got.filter((a) => a.fromCache).length} from cache)`);
  return [...pinned, ...got];
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

  try {
    // ---- Audio starts immediately, in parallel with the visual chain.
    // VO is synthesized PER SCENE from the approved script's exact lines and
    // later mixed at each scene's offset — this is what makes captions and
    // timing-true narration possible. vo_fit tightens any line that overruns
    // its scene by >10% (one LLM rewrite, then re-synth).
    const audioDir = path.join(jobDir, "audio");
    fs.mkdirSync(audioDir, { recursive: true });
    const voice = pickVoice(job, script);

    // ---- CAPTION DIRECTOR: resolve the caption/localization plan up front (on
    // deterministic script text, before VO is synthesized) so it can feed all
    // three consumers — VO (speaks the chosen voiceover language), the composer
    // (burns translated captions in the right font/direction), and the SRT/VTT
    // export. Fail-open: a null plan degrades to the pre-feature English path.
    const captionConfig = job.captions_config != null ? job.captions_config : (job.captions_enabled === 1);
    const captionPlan = await resolveCaptionPlan({ captionConfig, script, brief, job, tracker })
      .catch((e) => { console.warn(`[project] caption director failed: ${e.message}`); return null; });
    if (captionPlan) {
      console.log(`[project] captions: ${captionPlan.enabled ? "on" : "off"} subs=${captionPlan.language} voice=${captionPlan.voiceLanguage} mode=${captionPlan.mode}` +
        (captionPlan.mode !== "original" ? ` (subs ${captionPlan.translate.translatedCount}/${captionPlan.translate.totalCount}${captionPlan.translate.ok ? "" : " FELL BACK"})` : ""));
    }
    // The exact text each scene SPEAKS: the line in the chosen voiceover language,
    // else the original script line.
    const voTextFor = (s) => (captionPlan && captionPlan.voTextById[String(s.id)]) || s.voiceover;
    const captionStyle = captionPlan ? captionPlan.captionStyle : null;
    // Tell the TTS to speak in a non-English voiceover language natively — but
    // ONLY when the VO text was actually translated. On a translation failure
    // voTextById reverts to English source, so emitting the directive would make
    // gpt-audio read English under a "speak in <lang>" instruction (a silent desync).
    const voLangName = captionPlan && captionPlan.voiceLanguage && captionPlan.voiceLanguage !== "en"
      && captionPlan.voiceTranslate?.ok !== false
      ? captionPlan.voiceLanguageName : null;
    const voInstructions = `${voLangName ? `Speak entirely in ${voLangName}, as a native speaker. ` : ""}${script.voice.style}. Pace: ${script.voice.pace}.`;

    const voTask = Promise.all(script.scenes.map((s) =>
      (s.voiceover && s.voiceover.trim())
        ? synthesizeFitted({
            text: voTextFor(s), targetSec: s.duration, voice,
            instructions: voInstructions,
            outputPath: path.join(audioDir, `vo-${s.id}.mp3`),
            tracker,
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
      let assets = await assetsTask;
      db.setAssets(jobId, assets);

      // ---- Creative Director review (curate/score/assign before composition) ----
      // Fail-open (returns assets unchanged on any error); annotates visionOk/
      // sceneId so the composer honors its decisions; persists the review.
      if (config.creativeDirector.enabled && assets.length) {
        db.setProgress(jobId, "creative_review");
        assets = await reviewAndCurate({
          jobId, storyboard: sbRes.storyboard, script, subject: brief?.subject || null,
          brief, framePack, assets, tracker, jobDir, orientation: job.orientation,
        });
        db.setAssets(jobId, assets);
      }

      // ---- On-screen text localization (Video Text Language) ----
      // Translate the storyboard's headlines/subtext/bullets/onScreenText into the
      // video-text language, MUTATING sbRes.storyboard in place so the composer renders
      // localized text. Fail-open; no-op when the target is the source (English). (This
      // legacy pipeline does not reroute canvas/charset packs — the agent graph does.)
      let localizedStrings = null;
      if (captionPlan && captionPlan.videoTextLanguage && captionPlan.videoTextLanguage !== captionPlan.sourceLang) {
        db.setProgress(jobId, "localization");
        const locReport = await localizeStoryboardText({
          storyboard: sbRes.storyboard,
          videoTextLanguage: captionPlan.videoTextLanguage,
          videoTextLanguageName: captionPlan.videoTextLanguageName,
          textStyle: captionPlan.captionStyle && captionPlan.captionStyle.text,
          extraStrings: composerStringsFor(framePack),
          brief, job, script, tracker,
        }).catch((e) => { console.warn(`[project] localization failed: ${e.message}`); return null; });
        if (locReport) {
          localizedStrings = locReport.localizedStrings || null;
          try { db.setLocalization(jobId, locReport); } catch { /* fail-open */ }
          console.log(`[project] localization → ${captionPlan.videoTextLanguage} (${locReport.translatedElements}/${locReport.elementCount} verified, ${locReport.localizationCoverage}%)`);
        }
      }

      // Caption cues for ON-SCREEN baking. The Caption Director already built
      // these (estimated timing, resolved+translated text, language-aware
      // duration); the exported .srt/.vtt later uses real measured durations.
      // Fall back to the pre-feature English estimate if the plan is missing.
      const wc = (s) => (String(s || "").match(/\S+/g) || []).length;
      const captionCues = captionPlan
        ? captionPlan.bakedCues
        : (job.captions_enabled === 0 ? [] : buildCues(
            script.scenes
              .filter((s) => s.voiceover && s.voiceover.trim())
              .map((s) => ({
                sceneId: s.id,
                startSec: s.start,
                durationSec: Math.min(s.duration, wc(s.voiceover) / 2.6 + 0.4),
                sceneDurationSec: s.duration,
                text: s.voiceover,
              }))
          ).map((c) => ({ start: Math.round(c.start * 10) / 10, end: Math.round(c.end * 10) / 10, text: c.text })));

      // ---- Compose + render (frame-pack styled), with the v1 budget wrapper.
      // Tier 1: with assets. Tier 2: asset-less. Tier 3: deterministic fallback.
      const budget = (Number(config.server.stageBudgetSec) || 240) * 1000;
      const t1 = ms();
      db.setProgress(jobId, "composing");
      try {
        visualResult = await withBudget(
          (signal) => attemptLlmComposition({
            storyboard: sbRes.storyboard, dims, jobDir,
            assets, tracker, jobId, durationSec: duration,
            label: "project-main", abortSignal: signal, framePack, captionCues, captionStyle, localized: localizedStrings,
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
                assets: [], tracker, jobId, durationSec: duration,
                label: "project-no-assets", abortSignal: signal, framePack, captionCues, captionStyle, localized: localizedStrings,
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
            prompt: brief?.improvedPrompt || job.prompt, duration,
            orientation: job.orientation, width: dims.width, height: dims.height, fps: dims.fps,
            storyboard: sbRes.storyboard,
            packTokens: framePack ? require("./frame_registry").getPackTokens(framePack) : null,
            // Bake the (translated) captions into the emergency template too, so a
            // non-Latin film that falls all the way through still ships subtitles —
            // injectCaptionStyle below now covers the fallback's `.cap` elements.
            assets, captionCues,
          });
          fs.writeFileSync(path.join(jobDir, "index.html"), injectCaptionStyle(fb.indexHtml, captionStyle), "utf8");
          fs.writeFileSync(path.join(jobDir, "meta.json"), fb.metaJson, "utf8");
          tracker.addExternal("hyperframes_render");
          visualResult = await render({ jobId, jobDir, durationSec: duration });
        }
      }
    }

    // ---- Mix audio: per-scene VO clips at their offsets + ducked music ----
    {
      const t0 = ms();
      db.setProgress(jobId, "audio");
      const [voClips, musicPath, sfxClips] = await Promise.all([voTask, musicTask, sfxTask]);
      if (sfxClips.length) console.log(`[project] ${sfxClips.length} sfx mixed in`);

      // Captions: cue objects + subtitle files exported next to the MP4. Timing
      // comes from the MEASURED VO clips; the caption TEXT is the resolved
      // (possibly translated) line per scene — for "translated" mode the VO is
      // English but the subtitle is the target language, so we remap each clip's
      // text to the Caption Director's caption text before building cues.
      const captionClips = voClips.map((c) => ({
        ...c,
        text: (captionPlan && captionPlan.captionTextById[String(c.sceneId)]) || c.text,
      }));
      const cues = buildCues(captionClips);
      if (cues.length) {
        try {
          const wantSrt = !captionPlan || captionPlan.exportSRT;
          const wantVtt = !captionPlan || captionPlan.exportVTT;
          let srtUrl, vttUrl;
          if (wantSrt) { writeSrt(cues, path.join(config.paths.videosDir, `${jobId}.srt`)); srtUrl = `/videos/${jobId}.srt`; }
          if (wantVtt) { writeVtt(cues, path.join(config.paths.videosDir, `${jobId}.vtt`)); vttUrl = `/videos/${jobId}.vtt`; }
          // Finalize + persist the caption quality report (sync/readability/coverage
          // now known from the measured clips).
          const quality = captionPlan
            ? finalizeQuality(captionPlan, {
                voScenes: script.scenes.filter((s) => s.voiceover && s.voiceover.trim()),
                measuredCues: cues, voClips,
              })
            : undefined;
          db.setCaptions(jobId, {
            cues, srtUrl, vttUrl,
            language: captionPlan ? captionPlan.language : undefined,
            mode: captionPlan ? captionPlan.mode : undefined,
            quality,
          });
          if (quality) console.log(`[project] caption quality — lang=${quality.languageCode} sync=${quality.syncAccuracy} read=${quality.readabilityScore} cov=${quality.subtitleCoverage} font=${quality.fontCompatibility} xlate=${quality.translationQuality}`);
        } catch (e) {
          console.warn(`[project] subtitle export failed: ${e.message}`);
        }
      }

      // Audio Director decides the per-scene mastering plan; fail-open to null.
      const audioPlan = await directAudio({
        jobId, storyboard: sbRes.storyboard, script, voClips,
        sfxClips, musicPath, brief, subject: brief?.subject || null,
        durationSec: duration, tracker,
      }).catch(() => null);
      await mixAudioIntoVideo({
        visualPath: visualResult.videoPath,
        durationSec: duration,
        audio: {
          ttsPath: null,
          musicPath,
          // VO clips and sound effects both ride the mixer's offset mechanism.
          // kind:"vo" lets the mixer duck the music under speech.
          sfx: [
            ...voClips.map((c) => ({ path: c.path, startSec: c.startSec, volume: 1.0, kind: "vo" })),
            ...sfxClips,
          ],
          musicVolume: config.audio?.defaultMusicVolume ?? 0.15,
          audioPlan,
        },
      }).catch((e) => console.warn(`[project] mix failed: ${e.message}`));
      markStage("audio", t0);
    }

    // User-asset coverage disclosure (fail-open, never touches the render). The
    // scene-kit attaches an exact assetCoverage; other paths get an HTML scan.
    try {
      if ((assets || []).some((a) => a && a.source === "upload")) {
        let coverage = visualResult && visualResult.assetCoverage;
        if (!coverage) {
          let html = "";
          try { html = fs.readFileSync(path.join(jobDir, "index.html"), "utf8"); } catch { /* no file */ }
          coverage = coverageFromHtml({ assets, indexHtml: html });
        }
        if (coverage) db.setAssetCoverage(jobId, coverage);
      }
    } catch { /* fail-open */ }

    // Brand-color coverage disclosure (fail-open, never touches the render).
    try {
      const resolvedBrand = visualResult && visualResult.resolvedBrand;
      if (resolvedBrand) {
        let html = "";
        try { html = fs.readFileSync(path.join(jobDir, "index.html"), "utf8"); } catch { /* no file */ }
        const report = scoreBrandCoverage({ indexHtml: html, resolvedBrand });
        if (report) db.setBrandCoverage(jobId, report);
      }
    } catch { /* fail-open */ }

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
