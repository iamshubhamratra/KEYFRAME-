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
const { checkBudget, budgetExhaustedMessage, BUDGET_EXHAUSTED_MSG } = require("./openrouter");
const { generateBrief } = require("./brief");
const { generateScript, validateScript, normalizeScript } = require("./script");
const { understandWebsite } = require("./ingest/website");
const { transcribeVideo } = require("./ingest/transcribe");
const { generateStoryboard } = require("./storyboard");
const { buildFallback } = require("./fallback");
const { synthesizeFitted } = require("./vo_fit");
const { buildCues, writeSrt, writeVtt } = require("./captions");
const { resolveCaptionPlan, finalizeQuality, localizeStoryboardText } = require("./caption_director");
const languageDirector = require("./language_director");
const { injectCaptionStyle } = require("./caption_render");
const { fetchMusic } = require("./audio_sources");
const { getSfx } = require("./sfx_library");
const { resolveIntent } = require("./audio_cues");
const { VALID_VOICES } = require("./audio_planner");
const { render } = require("./renderer");
const { withBudget, attemptLlmComposition, mixAudioIntoVideo, fallbackQueriesFor, composerStringsFor } = require("./pipeline");
const { acquire, hasProviderFor } = require("./asset_sources");
const { reviewAndCurate } = require("./creative_director");
const { directAudio } = require("./audio_director");
const audioProfileSvc = require("./audio_profile");
const { tempoFor } = require("./pacing");
const { pinUserAssets, prepareUserAssets, inventoryForScript } = require("./user_assets");
const { pinWebsiteAssets } = require("./website_assets");
const { isLogo } = require("./asset_priority");
const { coverageFromHtml } = require("./asset_coverage");
const { scoreBrandCoverage } = require("./brand_coverage");
const { showcaseTargets } = require("./scene_role");
const { reconcileStoryboard } = require("./continuity");
const { planMotion } = require("./motion_planner");

function jobDirFor(jobId) { return path.join(config.paths.jobsDir, jobId); }
function ms() { return Date.now(); }

// One-line per-provider headroom for the block log — "$17.34 remaining" told you
// nothing about WHICH ceiling was actually binding.
function budgetSummary(b) {
  const parts = [];
  if (b.openrouter) {
    parts.push(`openrouter $${b.openrouter.remaining.toFixed(2)}`
      + (b.openrouter.dailyLimit != null ? ` (key cap $${b.openrouter.dailyLimit}/day, $${Number(b.openrouter.perKey ?? 0).toFixed(2)} left today)` : ""));
  }
  if (b.kie) parts.push(`kie $${b.kie.remaining.toFixed(2)} (${b.kie.credits} credits)`);
  return parts.join(", ") || "no provider reachable";
}

// ---------- Act 1: intake ----------

async function runIntake({ jobId, onApproved, skipBrief = false }) {
  const job = db.getRaw(jobId);
  if (!job) return;

  // Fail fast and legibly when the daily LLM budget is gone — a silent
  // fallback video with no voice is worse than an honest error.
  const budget = await checkBudget();
  if (budget && budget.remaining !== null && budget.remaining < 0.15) {
    // `remaining` is the BEST provider's headroom (chat() falls back), so this fires
    // only when NEITHER KIE nor OpenRouter can serve — not merely when one is capped.
    console.warn(`[project] ${jobId} blocked — no provider has headroom: ${budgetSummary(budget)}`);
    db.markFailed(jobId, budgetExhaustedMessage(budget));
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

      // THE COLLECTOR READS THE TEMPLATE'S APPETITE BEFORE IT CAPTURES.
      //
      // Capture happens here, at intake, and the frame pack is not chosen until production —
      // so this asks the pinned pack when the user pinned one, and the hungriest installed
      // pack when they left it on "auto". Bounded by config.ingest.maxSectionShots, because
      // every extra section is a scroll, a settle and a PNG on the intake path.
      const shotPlan = (() => {
        try {
          return require("./template_media").captureTarget({
            framePack: (intent.preferences && intent.preferences.framePack) || job.frame_pack || "auto",
            cap: Math.max(1, Number(config.ingest?.maxSectionShots) || 6),
          });
        } catch { return { target: 3, source: "fallback", appetite: 0 }; }
      })();
      if (intent.websiteUrl) {
        console.log(`[project] capture target: ${shotPlan.target} section shot(s) — ${shotPlan.source}`);
      }

      const websiteTask = intent.websiteUrl
        ? understandWebsite({ url: intent.websiteUrl, workDir, timeoutMs: config.ingest?.websiteTimeoutMs || 60_000, sectionTarget: shotPlan.target })
            .catch((e) => { console.warn(`[project] website ingest failed: ${e.message}`); return null; })
        : Promise.resolve(null);

      const videoTask = job.upload_path
        ? transcribeVideo({ videoPath: job.upload_path, workDir, tracker })
            .catch((e) => { console.warn(`[project] video ingest failed: ${e.message}`); return null; })
        : Promise.resolve(null);

      let [website, video] = await Promise.all([websiteTask, videoTask]);

      // ---- SCREENSHOT RESCUE (PeekShot) ------------------------------------------
      // The local headless-Chrome capture is primary and stays primary: it yields DOM
      // text, brand colours, typography and harvested assets that a hosted image API
      // cannot. But when it returns NOTHING — no Chrome, an SSRF/connection pin, a page
      // that never reaches networkidle — the film silently ships on stock, which is the
      // complaint this whole ingest exists to prevent. A hosted capture rescues exactly
      // that case, and natively blocks the consent banners that ruin these shots.
      //
      // Never on the happy path (each capture costs a credit), and never fatal.
      if (intent.websiteUrl && config.screenshotProvider !== "local") {
        const peekshot = require("./ingest/peekshot");
        const localShots = (website && website.shots && website.shots.length)
          ? website.shots.length
          : (website && (website.screenshotPaths || []).length) || 0;
        const forced = config.screenshotProvider === "peekshot";
        // An auth wall is a real answer, not a capture failure — a hosted browser hits
        // the same sign-in page, so spending credits there buys a screenshot of a login form.
        const authWalled = !!(website && website.isAuthWall);
        if (peekshot.enabled() && !authWalled && (forced || localShots === 0)) {
          console.warn(`[project] website capture produced ${localShots} usable screenshot(s)${forced ? "" : " — rescuing with PeekShot"}`);
          const rescued = await peekshot.captureShots({
            url: intent.websiteUrl,
            workDir,
            max: config.peekshot.mobileShot ? config.peekshot.maxShots : 1,
          }).catch((e) => { console.warn(`[project] peekshot rescue failed: ${e.message}`); return []; });
          if (rescued.length) {
            if (website) {
              // Merge: the local run may still have produced DOM signal worth keeping.
              website.shots = [...(website.shots || []), ...rescued];
              website.screenshotPaths = website.shots.map((s) => s.path);
              website.screenshotPath = website.screenshotPath || rescued[0].path;
            } else {
              // Chrome failed outright — seed the minimum the pipeline needs so the
              // captures still reach the film, without inventing DOM signal we don't have.
              website = {
                url: intent.websiteUrl, title: "", description: "", headings: [], bodyText: "",
                brandColors: [], ogImage: null, isAuthWall: false,
                shots: rescued, screenshotPaths: rescued.map((s) => s.path), screenshotPath: rescued[0].path,
                assets: [], harvestReview: null, brandSignals: null, source: "peekshot",
              };
            }
            db.setScreenshotSource(jobId, { provider: "peekshot", captured: rescued.length, rescued: !forced });
          }
        }
      }

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
        //
        // ONE shared deduper is threaded through the screenshot prune AND the brand-asset
        // prune below, so a harvested hero that also appears in a page screenshot is
        // dropped (never shown twice). It records the KEPT screenshots as it runs.
        const { makeImageDeduper } = require("./asset_sources/util");
        const sharedDeduper = makeImageDeduper();
        let deduperSeeded = false;
        if (config.screenshotIntelligence?.enabled && job.website_screenshots.length) {
          try {
            const { filterScreenshots } = require("./screenshot_intake");
            // Pass the CAPTURE RECORDS (path + clean/kind/heading/obstruction), not
            // bare paths: the gate can only reject an overlay-obstructed shot if the
            // capture stage's DOM-truth verdict actually reaches it.
            const { keptShots, review } = await filterScreenshots({
              shots: website.shots && website.shots.length ? website.shots : job.website_screenshots,
              deduper: sharedDeduper,
            });
            job.website_screenshots = keptShots.map((s) => s.path);
            job.website_shots = keptShots;   // metadata for scene-aware pinning
            deduperSeeded = true;
            if (website.isAuthWall) review.suppressed.push("auth-wall");
            db.setScreenshotReview(jobId, review);
            if (review.dropped.length) console.log(`[project] screenshot intelligence: kept ${review.kept}/${review.captured} (dropped ${review.dropped.map((d) => d.reason).join(", ")})`);
          } catch (e) { console.warn(`[project] screenshot intake skipped: ${e.message}`); }

          // SECOND RESCUE WINDOW — after the prune, not before it.
          //
          // The first rescue (above) fires when capture returns NOTHING. But the far more
          // common failure is capture returning shots that the intake gate then rejects as
          // overlay-obstructed — consent banners it could not dismiss. Observed live: a
          // real run produced 2 captures, the gate dropped both, and preflight hard-failed
          // the job with "all 2 capture(s) were rejected".
          //
          // That is precisely the case a hosted capture exists to solve (PeekShot blocks
          // cookie banners natively), and checking the count BEFORE the prune meant it
          // never got the chance. Rescued shots go through the same gate — they are not
          // trusted just because they cost a credit.
          if (job.website_screenshots.length === 0 && intent.websiteUrl
              && config.screenshotProvider !== "local" && !website.isAuthWall) {
            const peekshot = require("./ingest/peekshot");
            if (peekshot.enabled()) {
              console.warn(`[project] every capture was rejected by the quality gate — rescuing with PeekShot (it suppresses the consent banners that caused this)`);
              const rescued = await peekshot.captureShots({ url: intent.websiteUrl, workDir, max: 1 })
                .catch((e) => { console.warn(`[project] peekshot rescue failed: ${e.message}`); return []; });
              if (rescued.length) {
                try {
                  const { filterScreenshots } = require("./screenshot_intake");
                  const { keptShots } = await filterScreenshots({ shots: rescued, deduper: sharedDeduper });
                  if (keptShots.length) {
                    job.website_screenshots = keptShots.map((s) => s.path);
                    job.website_shots = keptShots;
                    website.shots = keptShots;
                    website.screenshotPaths = job.website_screenshots;
                    website.screenshotPath = job.website_screenshots[0];
                    db.setScreenshotSource(jobId, { provider: "peekshot", captured: keptShots.length, rescued: true, after: "quality-gate" });
                    console.log(`[project] PeekShot rescue: ${keptShots.length} usable capture(s) recovered`);
                  }
                } catch (e) { console.warn(`[project] rescue prune skipped: ${e.message}`); }
              }
            }
          }
        } else if (config.screenshotIntelligence?.enabled && website.isAuthWall) {
          // No usable shots but a real auth wall — disclose why the film uses stock.
          db.setScreenshotReview(jobId, { captured: 0, kept: 0, dropped: [], suppressed: ["auth-wall"], notes: ["The site is behind a sign-in wall, so its screens can't be shown — the film uses stock/brand visuals instead."] });
        }

        // WEBSITE ASSET INTELLIGENCE (harvest → classify → dedup → logo palette + brand
        // signals). Runs at the SAME shared intake choke point (reaches both orchestrators),
        // immediately after the screenshot prune so it can share the deduper. Writes
        // job.website_assets + the disclosure, seeds the harvested LOGO's colours onto
        // intent.logo.brandColors (Art Director "logo" tier — the highest-lift move), and
        // captures the site's TYPOGRAPHY + a cleaner CSS-computed brand palette. Runs even
        // when no asset FILES were harvestable (fonts/colours are DOM-derived). Fail-open.
        if (config.harvester?.enabled) {
          try {
            const { prepareWebsiteAssets, resolveBrandSignals } = require("./website_assets");
            // 1) Brand signals — fonts (name-only) + computed palette. The CSS-computed
            //    palette is cleaner than the hero-screenshot quantize (which caught
            //    marketing-gradient noise), so it leads the "extracted" tier, hero fills.
            const bs = resolveBrandSignals(website.brandSignals);
            if (bs.fonts) intent.website.fonts = bs.fonts;
            if (bs.palette.length) {
              // CSS leads the extracted tier but is capped at 3 so the hero-screenshot's
              // dominant colour always survives the slice(0,4) — CSS can be misled by a
              // stray link/social colour, so we never DISCARD the hero signal entirely.
              intent.website.brandColors = [...new Set([...bs.palette.slice(0, 3), ...(intent.website.brandColors || [])])].slice(0, 4);
              console.log(`[project] brand palette (css): ${bs.palette.join(" ")}`);
            }
            if (bs.fontsExtracted.length) console.log(`[project] brand fonts: ${bs.fontsExtracted.join(", ")}`);

            // 2) Asset files (logo + imagery), when any were harvestable.
            let review = null;
            if (Array.isArray(website.assets) && website.assets.length) {
              // If the screenshot prune didn't run (SI off / no shots), seed the shared
              // deduper with the current screenshots so cross-dedup still holds.
              if (!deduperSeeded) { for (const s of job.website_screenshots || []) { try { await sharedDeduper.add(s); } catch { /* noop */ } } }
              const hasUploadLogo = (job.user_assets || []).some((u) => u && u.role === "logo");
              const prepared = await prepareWebsiteAssets({
                job, jobDir: jobDirFor(jobId), harvest: { files: website.assets, review: website.harvestReview }, deduper: sharedDeduper,
                // The CSS-computed accent palette (from resolveBrandSignals above) is the
                // fallback for the logo tier when the mark is a monochrome black/white
                // wordmark with no extractable hue — so the brand colour still reaches the
                // Art Director's high-confidence "logo" tier + the CTA lockup.
                brandPalette: bs.palette,
              });
              review = prepared.review;
              job.website_assets = prepared.records;
              intent.website.assetInventory = {
                count: prepared.records.length,
                hasLogo: prepared.records.some((r) => r.assetType === "logo"),
                kinds: [...new Set(prepared.records.map((r) => r.assetType))],
              };
              // Harvested LOGO palette → Art Director "logo" tier, ONLY when the user did
              // not upload their own logo (a manual logo always wins its colours). Merge.
              if (!hasUploadLogo && Array.isArray(prepared.brandColors) && prepared.brandColors.length) {
                intent.logo = { ...(intent.logo || {}), brandColors: prepared.brandColors };
                console.log(`[project] harvested logo colors → intent.logo (${prepared.brandColorsSource || "mark"}: ${prepared.brandColors.join(",")})`);
              }
              console.log(`[project] website assets: kept ${prepared.records.length} (${review.logos} logo(s))${review.dropped.length ? `, dropped ${review.dropped.length}` : ""}`);
            }

            // 3) Disclosure — fold the font/palette signals into the harvest review so a
            //    fonts-only run (no asset files) still discloses what was found.
            const disclosure = review || { discovered: 0, downloaded: 0, kept: 0, dropped: [], logos: 0, brandColorsExtracted: [], notes: [] };
            disclosure.fontsExtracted = bs.fontsExtracted;
            if (bs.palette.length) disclosure.brandPalette = intent.website.brandColors;
            db.setAssetHarvest(jobId, disclosure);
          } catch (e) { console.warn(`[project] website-asset harvest skipped: ${e.message}`); }
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
            // Merge, not replace: a harvested-logo palette may have been seeded above,
            // and the UPLOADED logo must win — overwrite just brandColors, keep the rest.
            intent.logo = { ...(intent.logo || {}), brandColors: cols };
            console.log(`[project] logo colors extracted: ${cols.join(",")}`);
          }
        } catch (e) { console.warn(`[project] logo color extraction skipped: ${e.message}`); }
      }
      job.intent = intent;
    }

    // ---- LANGUAGE DIRECTOR: resolve the unified language plan ONCE, up front (before the
    // brief/script), and persist it as the single source of truth every downstream stage reads.
    // Deterministic (no LLM). It makes the script model localization-aware (translate-cleanly
    // directive), protects brand/tech terms, and guarantees the three axes stay in sync.
    let languagePlan = null;
    if (config.languageDirector?.enabled) {
      try {
        languagePlan = languageDirector.resolveLanguagePlan({ job, brief: job.brief || null });
        db.setLanguagePlan(jobId, languagePlan);
        job.languagePlan = languagePlan;                 // so this run's downstream reads it too
        intent.language = { code: languagePlan.videoTextLanguage, voice: languagePlan.voiceLanguage, subs: languagePlan.captionLanguage, mode: languagePlan.mode, dir: languagePlan.dir };
        console.log(`[project] language_director → voice=${languagePlan.voiceLanguage} subs=${languagePlan.captionLanguage} text=${languagePlan.videoTextLanguage} mode=${languagePlan.mode}${languagePlan.dir === "rtl" ? " rtl" : ""}${languagePlan.scriptDirective ? " · localization-aware script" : ""}${languagePlan.consistency.notes.length ? ` · ${languagePlan.consistency.notes.length} consistency note(s)` : ""}`);
      } catch (e) { console.warn(`[project] language_director skipped: ${e.message}`); }
    }

    const intakeBudgetMs = (Number(config.server.stageBudgetSec) || 480) * 1000;

    // ---- PRODUCT UNDERSTANDING: the stage that stops a bare prompt producing a bare film.
    //
    // On the URL path this is a no-op — `shouldRun` returns false the moment the ingest
    // produced real body text or headings, because a brief distilled from evidence beats a
    // brief distilled from inference. It fires on the PROMPT-ONLY path, which is the one
    // that had no research stage at all: brief.js received one sentence, system_brief.md
    // rule 1 correctly forbade inventing anything, `mustIncludeFacts` came back empty, and
    // system_script.md rule 3 ("facts only from the brief") left the writer with nothing
    // concrete to say. That is the mechanical origin of the generic filler.
    //
    // The model it produces separates CATEGORY KNOWLEDGE (allowed, and what makes a script
    // specific) from SPECIFIC CLAIMS (forbidden, and re-checked against the user's own words
    // before it is allowed to become a quotable fact). It also carries `visualVocabulary` —
    // literal, shootable subjects with an asset type and a priority — which the asset
    // requirement planner uses instead of stripping stopwords out of a prose direction.
    //
    // Fail-open, and OUTSIDE the ingest cache gate so a regenerate can recover it.
    if (config.productUnderstanding?.enabled && !intent.product) {
      const t0 = ms();
      try {
        const pu = require("./product_understanding");
        if (pu.shouldRun(intent)) {
          db.setProgress(jobId, "understanding");
          const res = await withBudget((signal) => pu.understandProduct({ intent, signal }), intakeBudgetMs, "product understanding");
          if (res && res.product) {
            tracker.addLlm({ inputTokens: res.tokensIn, outputTokens: res.tokensOut, stage: "product", model: res.model, provider: res.provider });
            intent.product = res.product;
            job.intent = intent;
            timings.productMs = ms() - t0;
            try { db.setProductModel(jobId, res.product); } catch { /* disclosure never blocks intake */ }
          }
        }
      } catch (e) { console.warn(`[project] product understanding skipped: ${e.message}`); }
    }

    let brief;
    if (skipBrief && job.brief) {
      brief = job.brief; // regenerate-script keeps the existing brief
    } else {
      const t0 = ms();
      db.setProgress(jobId, "brief");
      const briefRes = await withBudget((signal) => generateBrief({ intent, signal }), intakeBudgetMs, "brief stage");
      tracker.addLlm({ inputTokens: briefRes.tokensIn, outputTokens: briefRes.tokensOut, stage: "brief", model: briefRes.model, provider: briefRes.provider });
      timings.briefMs = ms() - t0;
      brief = briefRes.brief;
    }

    // The language plan was resolved BEFORE the brief (to steer script authoring), so its
    // do-not-translate glossary couldn't yet include the brief's SUBJECT/brand. Enrich it now
    // that the brief exists and re-persist — production's translation AND the Language QA both
    // read the enriched glossary, so the brand is protected and not mis-flagged as leakage.
    if (languagePlan && brief) {
      try {
        languagePlan.glossary = languageDirector.buildGlossary({ job, brief });
        db.setLanguagePlan(jobId, languagePlan);
        job.languagePlan = languagePlan;
      } catch { /* keep the intake glossary */ }
    }

    // The user's explicit duration wins over the model's suggestion.
    if (job.duration) brief.suggestedDuration = job.duration;

    const tScript = ms();
    db.setProgress(jobId, "script");
    const scriptRes = await withBudget((signal) => generateScript({ brief, userAssets: intent.userAssets || null, signal, languageDirective: languagePlan?.scriptDirective || null, product: intent.product || null }), intakeBudgetMs, "script stage");
    tracker.addLlm({ inputTokens: scriptRes.tokensIn, outputTokens: scriptRes.tokensOut, stage: "script", model: scriptRes.model, provider: scriptRes.provider });
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
  // Shared, role-based showcase targeting (services/scene_role) — the same rule the
  // graph and both asset pinners use, instead of a fourth copy that exact-matched
  // `purpose` and therefore missed "benefit"/"solution"/"the problem".
  const targets = showcaseTargets(script)
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
  // Real website SCREENSHOTS (tier 80) claim showcase scenes BEFORE tier-70 harvested
  // imagery — mirroring the graph orchestrator (which reserves screenshot scenes into
  // pinnedSceneIds first). Reserving brand imagery first would let tier-70 assets starve
  // the higher-tier real product captures of showcase scenes (an orchestrator drift +
  // tier-law inversion). So: screenshots first, then brand imagery fills the leftovers.
  const shots = screenshotAssets({ job, script, jobDir, excludeSceneIds: userPins.usedSceneIds, max: userPins.pinned.length ? 2 : 3 });
  const reservedBeforeBrand = new Set([...userPins.usedSceneIds, ...shots.map((a) => a.sceneId).filter(Boolean)]);
  // Harvested website brand assets (logo tier 90 + imagery tier 70) — the site's OWN
  // visuals, below uploads/screenshots. Same shared pinner both orchestrators call, so
  // they can't drift. Fail-open.
  const brandPins = await pinWebsiteAssets({
    job, script, jobDir, usedSceneIds: reservedBeforeBrand,
    hasUploadLogo: !!userPins.logoAsset, maxPins: userPins.pinned.length ? 2 : 4,
  }).catch((e) => { console.warn(`[project] pinWebsiteAssets failed: ${e.message}`); return { brandPinned: [], brandLogo: null }; });
  const pinned = [
    ...userPins.pinned,
    ...(userPins.logoAsset ? [userPins.logoAsset] : []),
    ...(brandPins.brandLogo ? [brandPins.brandLogo] : []),
    ...brandPins.brandPinned,
    ...shots,
  ];

  const wanted = [];
  const videoOk = hasProviderFor("video");
  // Suppress stock backgrounds only on scenes an actual IMAGE claims — an overlay logo
  // (role:"logo", on the CTA scene) is a chip, not a scene filler, and must NOT veto that
  // scene's background (matches graph.js, which never reserves the logo's scene).
  const screenshotScenes = new Set(pinned.filter((a) => !isLogo(a)).map((a) => a.sceneId));
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
    console.warn(`[project] ${jobId} production blocked — no provider has headroom: ${budgetSummary(budget)}`);
    db.markFailed(jobId, budgetExhaustedMessage(budget));
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
  // The Creative Director's soundtrack verdict, captured when it reviews the assets and
  // consumed by the Audio Director further down (it is authored in an inner block, so it
  // has to live out here). Null when the director is disabled or fails — the Audio
  // Director then behaves exactly as before.
  let audioAdvice = null;
  // The storyboard result. Declared HERE rather than inside the storyboard block because
  // the audio stage below reads it: `const sbRes` was block-scoped and the Audio Director
  // call sat outside that block, so this function threw
  // `ReferenceError: sbRes is not defined` at the audio stage — every single run, AFTER
  // the render and the voiceover had already succeeded, turning a finished film into a
  // failed job. It never surfaced because `orchestrator: "langgraph"` routes production
  // through agents/graph.js; this path is only reached if that flag is flipped, and it
  // has no integration test.
  let sbRes = null;

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
    const languagePlan = languageDirector.getPlan(job);   // single source of truth (persisted at intake)
    const captionPlan = await resolveCaptionPlan({ captionConfig, script, brief, job, tracker, languagePlan })
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

    // THE VOICEOVER DECISION — identical contract to graph.voiceAgent (the two
    // orchestrators must not drift): the toggle skips SYNTHESIS only. The script keeps
    // its narration text because storyboardPromptFromScript feeds it to the storyboard
    // model, so the picture is the same film either way.
    const voEnabled = job.voiceover_enabled !== 0;
    if (!voEnabled) console.log(`[project] narration DISABLED by the user — skipping synthesis (script text kept), music-led mix`);
    const voTask = voEnabled
      ? Promise.all(script.scenes.map((s) =>
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
        )).then((arr) => arr.filter(Boolean))
      : Promise.resolve([]);

    // Sound effects from the script's per-scene sfx[] — fetched in parallel,
    // landed at each scene's start, mixed under the VO.
    const sfxWanted = [];
    for (const s of script.scenes) {
      for (const name of (s.sfx || [])) {
        if (sfxWanted.length < 6) sfxWanted.push({ query: name, startSec: s.start });
      }
    }
    // getSfx, not fetchSfx: the curated library + intent vocabulary + the template's
    // palette + conditionCue all live behind getSfx. Calling the web fetcher directly
    // skipped every one of them, so cues arrived at whatever level the provider served —
    // the exact level defect audio_cues.js documents. Music on this path was already
    // template-driven; this brings its sound effects in line.
    const sfxProfile = audioProfileSvc.profileFor(framePack);
    // ONE FILM, ONE SET OF SOUNDS — same rule as the graph path. Two moments of the same kind map to
    // the same pack cue, and a repeated sample reads as a mistake ("counter-tick x2" on job
    // 1ntmvaft5g). Passing what has been used lets the palette swap in a sibling; map() runs its
    // callbacks in order synchronously, so the set fills deterministically.
    const usedCues = new Set();
    const sfxTask = Promise.all(sfxWanted.map((s, i) => {
      const raw = s.query;
      const cue = audioProfileSvc.paletteCueFor(sfxProfile, resolveIntent(raw) || raw, { avoid: usedCues });
      usedCues.add(cue);
      return getSfx({ name: cue, outputPath: path.join(audioDir, `sfx-${i}.mp3`), tracker })
        .then((p) => p ? { path: p, startSec: s.startSec, volume: 0.4, name: cue } : null)
        .catch(() => null);
    })).then((arr) => arr.filter(Boolean));

    // TEMPLATE-DRIVEN MUSIC — same resolver as the graph path, so a film sounds like its
    // template on either orchestrator. A pack with no audio block yields exactly the old
    // script-derived query.
    const audioProfile = audioProfileSvc.profileFor(framePack);
    const musicSelection = {};
    const musicPlan = audioProfileSvc.musicCandidatesFor({
      framePack, jobId, narration: voEnabled ? "on" : "off",
      scriptMusic: script.music || null, profile: audioProfile,
    });
    if (musicPlan.candidates.length) {
      console.log(`[project] music search (${musicPlan.source}${musicPlan.keywords.length ? `: ${musicPlan.keywords.join(" + ")}` : ""}) → ${musicPlan.candidates.slice(0, 3).map((c) => `"${c}"`).join(", ")}`);
    }
    const musicTask = musicPlan.candidates.length
      ? fetchMusic({
          candidates: musicPlan.candidates, outputPath: path.join(audioDir, "music.mp3"),
          tracker, durationSec: duration, style: audioProfile.style, selection: musicSelection,
          // Per-job search window, and no synthesized pad when the bed is the whole
          // soundtrack — see the notes in audio_sources.fetchMusic.
          seed: `${jobId || ""}|${framePack || ""}`,
          allowGeneratedPad: voEnabled,
          jobId: jobId || "", framePack: framePack || "",
        })
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
      // framePack is part of this stage's brief (pack-specific motifs + adjacent-scene
      // variety live in system_storyboard.md behind it) — see graph.storyboardAgent.
      sbRes = await generateStoryboard({ prompt: sbPrompt, duration, orientation: job.orientation, framePack });
      tracker.addLlm({ inputTokens: sbRes.tokensIn, outputTokens: sbRes.tokensOut, stage: "storyboard", model: sbRes.model, provider: sbRes.provider });
      // CONTINUITY GATE — same authority the graph runs: the approved script owns
      // scene structure/timing, the storyboard owns enrichment. Without it the
      // composition renders on rescaled timings while the VO/captions/assets use the
      // script's, and the two drift apart audibly. Fail-open.
      try {
        const { storyboard: fixedSb, report } = reconcileStoryboard({ storyboard: sbRes.storyboard, script });
        sbRes.storyboard = fixedSb;
        if (report.changed) {
          console.warn(`[project] continuity: ${report.notes.join(" | ")}`);
          try { db.setContinuityReport(jobId, report); } catch { /* best effort */ }
        }
      } catch (e) { console.warn(`[project] continuity check skipped: ${e.message}`); }

      // PACING RIDES THE STORYBOARD — same stamp the graph applies, so a film cut on this
      // orchestrator moves at the same tempo as one cut on the other. Motion only: scene
      // count and durations stay the approved script's. See services/pacing.js.
      sbRes.storyboard.pacing = tempoFor({
        narration: voEnabled ? "on" : "off",
        energyBoost: audioProfileSvc.profileFor(framePack).noVo.energyBoost,
      });
      if (!voEnabled) console.log(`[project] pacing → ${sbRes.storyboard.pacing.label}: motion x${sbRes.storyboard.pacing.motion}, cuts x${sbRes.storyboard.pacing.xfade}`);
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
          // Same in-band handoff the graph makes: the director's soundtrack verdict
          // reaches the Audio Director below instead of dead-ending in the database.
          onReview: (report) => {
            audioAdvice = { music: report.musicAnalysis || null, sfx: report.soundEffectAnalysis || null };
          },
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
          brief, job, script, tracker, glossary: languagePlan?.glossary,
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

      // ---- ASSET REUSE OPTIMIZER — the same call the graph makes (its asset_reuse node),
      // at the same point in the flow: after assignment, before composition. Single-sourced
      // through services/asset_reuse so the two orchestrators cannot drift, exactly like
      // pinUserAssets / pinWebsiteAssets. Deterministic and fail-open.
      if (config.assetReuse?.enabled) {
        try {
          const { optimizeAssetReuse } = require("./asset_reuse");
          const { assets: withReuse, review } = optimizeAssetReuse({
            assets, script, storyboard: sbRes.storyboard, framePack,
            dims: { width: dims.width, height: dims.height },
            native: !!require("./frame_manifest").getManifest(framePack)?.renderer,
            renderer: require("./frame_manifest").getManifest(framePack)?.renderer || null,
            acceptsVectors: require("./frame_manifest").packAcceptsVectors(framePack),
            seedKey: jobId,
          });
          if (review) {
            assets = withReuse;
            db.setAssets(jobId, assets);
            db.setAssetReuseReport(jobId, review);
            console.log(`[project] asset_reuse → ${review.assetCoverage} of ${review.slotsDemanded} slot(s) covered `
              + `(${review.slotsFilledUnique} unique, ${review.slotsFilledReuse} reuse, ${review.slotsFilledDecorative} decorative)`);
          }
        } catch (e) { console.warn(`[project] asset_reuse skipped: ${e.message}`); }
      }

      // ---- Compose + render (frame-pack styled), with the v1 budget wrapper.
      // Tier 1: with assets. Tier 2: asset-less. Tier 3: deterministic fallback.
      const budget = (Number(config.server.stageBudgetSec) || 240) * 1000;
      const t1 = ms();
      // MOTION PLAN — per-scene entrance + camera, decided before composition (the same
      // planner the graph runs). Deterministic; null degrades to the pack film-level motion.
      let motionPlan = null;
      try {
        motionPlan = planMotion({ storyboard: sbRes.storyboard, framePack, layoutPlan: null, seedKey: jobId });
        if (motionPlan) { try { db.setMotionPlan(jobId, motionPlan); } catch { /* disclosure never blocks a render */ } }
      } catch (e) { console.warn(`[project] motion planner skipped: ${e.message}`); }
      db.setProgress(jobId, "composing");
      try {
        visualResult = await withBudget(
          (signal) => attemptLlmComposition({
            storyboard: sbRes.storyboard, dims, jobDir,
            assets, tracker, jobId, durationSec: duration,
            label: "project-main", abortSignal: signal, framePack, captionCues, captionStyle, localized: localizedStrings, motionPlan,
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
                label: "project-no-assets", abortSignal: signal, framePack, captionCues, captionStyle, localized: localizedStrings, motionPlan,
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
    // Hoisted out of the block below so the delivery probe at finalize can assert an audio
    // track from what was actually MIXED rather than from what the job requested.
    let audioMixed = false;
    {
      const t0 = ms();
      db.setProgress(jobId, "audio");
      const [voClips, musicPath, sfxClips] = await Promise.all([voTask, musicTask, sfxTask]);
      audioMixed = Boolean(musicPath || voClips.length || sfxClips.length);
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
      let cues = buildCues(captionClips);
      // Captions must not vanish with the voice — same guard as graph.timelineAgent. Cue
      // timing is MEASURED from the VO clips, so a narration-free film would export no
      // .srt and no .vtt at all, which is backwards: muted social video is where
      // subtitles matter most. Fall back to the Caption Director's estimated timing and
      // record which it was.
      let cueTiming = "measured";
      if (!cues.length && captionPlan && Array.isArray(captionPlan.bakedCues) && captionPlan.bakedCues.length) {
        cues = captionPlan.bakedCues.map((c) => ({ start: c.start, end: c.end, text: c.text }));
        cueTiming = "estimated";
        console.log(`[project] captions: no measured VO clips — exporting ${cues.length} cue(s) from estimated timing`);
      }
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
            timing: cueTiming,
            quality: quality ? { ...quality, timingSource: cueTiming } : quality,
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
        musicAdvice: audioAdvice?.music || null,
        sfxAdvice: audioAdvice?.sfx || null,
        narration: voEnabled ? "on" : "off",
        framePack, audioProfile,
      }).catch(() => null);

      // Deterministic audio validation — the graph orchestrator has always built this;
      // the legacy path never did, so a film produced here had no soundtrack record at
      // all. Same module, same inputs, so the two paths cannot report differently.
      // Fail-open (THE LAW): a disclosure never touches the render.
      try {
        const { buildAudioReport } = require("./audio_report");
        const report = buildAudioReport({
          plan: audioPlan, sfxClips, scenes: script.scenes, musicPath,
          musicMood: (script.music && script.music.mood) || "", voClips,
          narration: voEnabled ? "on" : "off",
          voiceoverRequested: voEnabled, profile: audioProfile,
          // candidates + scriptQuery, not just keywords: audio_report validates the winning query
          // against what was ASKED. Passing only `keywords` left this path on the 1-2 entry
          // sample and reproduced the false "script-fallback" verdict the graph path had.
          musicSelection: { ...musicSelection, keywords: musicPlan.keywords, candidates: musicPlan.candidates, scriptQuery: musicPlan.scriptQuery },
        });
        db.setAudioReport(jobId, report);
        console.log(`[project] audio: ${report.soundEffects} effect(s), narration=${report.narration}, music=${report.musicSource}, quality=${report.qualityScore}`
          + (report.issues.length ? ` — ${report.issues.join("; ")}` : ""));
      } catch (e) { console.warn(`[project] audio report skipped: ${e.message}`); }
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

    // MOTION VERIFICATION — plan vs. what the composer actually emitted. The graph runs
    // this as its `animation` node; without it here the legacy path would plan motion and
    // never check whether any of it survived. Fail-open (THE LAW).
    try {
      const { verifyMotion } = require("./motion_planner");
      let html = "";
      try { html = fs.readFileSync(path.join(jobDir, "index.html"), "utf8"); } catch { /* no file */ }
      const v = verifyMotion({ plan: db.getRaw(jobId)?.motion_plan || null, indexHtml: html, storyboard: sbRes.storyboard });
      db.setMotionAudit(jobId, {
        tweenCount: v.totalTweens, sceneCount: (sbRes.storyboard?.scenes || []).length,
        tweensPerScene: v.tweensPerScene, planned: v.planned, planHonored: v.honored,
        honoredCount: v.honoredCount, checkedCount: v.checkedCount, ownChoreography: !v.planAware,
        staticScenes: v.staticScenes, driftedScenes: v.driftedScenes, scenes: v.scenes, warnings: v.warnings,
      });
      if (v.warnings.length) console.warn(`[project] motion audit: ${v.warnings.join(" | ")}`);
    } catch (e) { console.warn(`[project] motion audit skipped: ${e.message}`); }

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

    // Website Asset Intelligence — Asset Usage Report + Validation Gate (fail-open, never
    // touches the render). Single-sourced with the graph orchestrator via the shared
    // asset_usage_report module so the two production paths can't drift.
    try {
      if (config.harvester?.enabled) {
        const { buildAssetUsageReport } = require("./asset_usage_report");
        const report = buildAssetUsageReport({
          job: db.getRaw(jobId) || job,
          assets,
          harvestReport: (db.getRaw(jobId) || {}).asset_harvest || null,
          brandReview: visualResult && visualResult.resolvedBrand || null,
        });
        if (report) db.setAssetUsageReport(jobId, report);
      }
    } catch { /* fail-open */ }

    // Language QA disclosure (fail-open, never touches the render): font embedded, English
    // leakage in on-screen DOM text, coverage, consistency — scored against the composed HTML.
    try {
      if (languagePlan && languagePlan.videoTextLanguage && languagePlan.videoTextLanguage !== languagePlan.sourceLang) {
        let html = "";
        try { html = fs.readFileSync(path.join(jobDir, "index.html"), "utf8"); } catch { /* no file */ }
        const raw = db.getRaw(jobId) || {};
        const report = languageDirector.runLanguageQa({ plan: languagePlan, indexHtml: html, localization: raw.localization, captionQuality: raw.captionQuality });
        if (report) {
          db.setLanguageQa(jobId, report);
          console.log(`[project] language_qa → font=${report.fontLoaded ? "ok" : "MISSING"} leakage=${report.leakage.count}word(s)/${report.leakage.score}%${report.degraded ? " DEGRADED" : ""}`);
        }
      }
    } catch (e) { console.warn(`[project] language_qa skipped: ${e.message}`); }

    db.setProgress(jobId, "finalizing");
    // PROBE THE ARTIFACT, not the plan — see the note at the same point in pipeline.js.
    await require("./video_probe").recordDeliveryProbe(jobId, visualResult.videoPath, {
      width: dims.width, height: dims.height, fps: dims.fps,
      durationSec: duration,
      // Only what was actually mixed — see the note at the same call in agents/graph.js.
      expectAudio: audioMixed,
    });
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
