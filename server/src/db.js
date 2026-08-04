// In-memory job store with atomic JSON persistence.
// No native deps — works on any Node version EB might pick for us.
// Scale target: up to a few thousand jobs retained, trivially fast.

const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");

const DB_FILE = config.paths.dbFile;
const TMP_FILE = DB_FILE + ".tmp";

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

/** @type {Map<string, object>} */
const jobs = new Map();

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      for (const j of arr) if (j && j.id) jobs.set(j.id, j);
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.warn(`[db] could not load ${DB_FILE}: ${e.message}. Starting fresh.`);
    }
  }
}

let writeTimer = null;
function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => { writeTimer = null; persist(); }, 100);
  writeTimer.unref?.();
}

function persist() {
  try {
    const arr = Array.from(jobs.values());
    fs.writeFileSync(TMP_FILE, JSON.stringify(arr), "utf8");
    fs.renameSync(TMP_FILE, DB_FILE);
  } catch (e) {
    console.error(`[db] persist failed: ${e.message}`);
  }
}

// ---- bootstrap ----
load();

// Crash recovery: orphaned jobs at boot cannot finish.
let recovered = 0;
for (const j of jobs.values()) {
  if (j.status === "queued" || j.status === "running") {
    j.status = "failed";
    j.error = j.error || "server restarted while job was in-flight";
    j.finished_at = Date.now();
    recovered++;
  }
}
if (recovered > 0) {
  console.log(`[db] recovered ${recovered} orphaned job(s) at boot`);
  persist();
}

// Fold a later act's usage report into the one already stored.
//
// THE BUG THIS FIXES: a project runs as two acts with two separate UsageTrackers —
// runIntake (brief + script) then runProduction (storyboard, directors, composer,
// TTS). Both wrote `j.usage = usage`, so the production write REPLACED the intake
// one and every finished project reported a cost that began mid-pipeline. Measured
// across the job history: 98 of 98 finished projects had lost their brief+script
// cost, understating the true figure by roughly 28%.
//
// Merging rather than replacing also makes markFailed honest: a job that dies in
// production still shows what intake already spent.
function mergeUsage(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  const num = (a, b) => (Number(a) || 0) + (Number(b) || 0);
  const r6 = (n) => Math.round(n * 1e6) / 1e6;

  // byStage rows are keyed by stage+model+provider so the same stage served by two
  // different providers stays visible as two rows rather than being averaged away.
  const rows = new Map();
  for (const b of [...(prev.byStage || []), ...(next.byStage || [])]) {
    const k = `${b.stage}|${b.model}|${b.provider || ""}`;
    const cur = rows.get(k);
    if (!cur) { rows.set(k, { ...b }); continue; }
    cur.inputTokens  = num(cur.inputTokens,  b.inputTokens);
    cur.outputTokens = num(cur.outputTokens, b.outputTokens);
    cur.totalTokens  = num(cur.totalTokens,  b.totalTokens);
    cur.callCount    = num(cur.callCount,    b.callCount);
    cur.costUsd      = r6(num(cur.costUsd,   b.costUsd));
  }
  const byStage = [...rows.values()].sort((a, b) => (b.costUsd || 0) - (a.costUsd || 0));

  const byProvider = {};
  for (const src of [prev.byProvider || {}, next.byProvider || {}]) {
    for (const [k, v] of Object.entries(src)) {
      const acc = (byProvider[k] ||= { inputTokens: 0, outputTokens: 0, callCount: 0, costUsd: 0 });
      acc.inputTokens  = num(acc.inputTokens,  v.inputTokens);
      acc.outputTokens = num(acc.outputTokens, v.outputTokens);
      acc.callCount    = num(acc.callCount,    v.callCount);
      acc.costUsd      = r6(num(acc.costUsd,   v.costUsd));
    }
  }

  const external = { ...(prev.external || {}) };
  for (const [k, v] of Object.entries(next.external || {})) external[k] = num(external[k], v);

  const sum = (path, field) => num((prev[path] || {})[field], (next[path] || {})[field]);
  return {
    byStage,
    byProvider,
    llm: {
      inputTokens:   sum("llm", "inputTokens"),
      outputTokens:  sum("llm", "outputTokens"),
      callCount:     sum("llm", "callCount"),
      inputCostUsd:  r6(sum("llm", "inputCostUsd")),
      outputCostUsd: r6(sum("llm", "outputCostUsd")),
      totalCostUsd:  r6(sum("llm", "totalCostUsd")),
    },
    tts: {
      inputChars:      sum("tts", "inputChars"),
      inputTokensEst:  sum("tts", "inputTokensEst"),
      outputTokensEst: sum("tts", "outputTokensEst"),
      callCount:       sum("tts", "callCount"),
      inputCostUsd:    r6(sum("tts", "inputCostUsd")),
      outputCostUsd:   r6(sum("tts", "outputCostUsd")),
      totalCostUsd:    r6(sum("tts", "totalCostUsd")),
    },
    external,
    totalCostUsd: r6(num(prev.totalCostUsd, next.totalCostUsd)),
  };
}

function shape(j) {
  if (!j) return null;
  return {
    jobId: j.id,
    kind: j.kind || "generate",
    status: j.status,
    progress: j.progress,
    videoUrl: j.video_url,
    error: j.error,
    orientation: j.orientation,
    quality: j.quality,
    width: j.width,
    height: j.height,
    fps: j.fps,
    duration: j.duration,
    framePack: j.frame_pack || null,
    brandPalette: j.brand_palette || null,
    // Light manifest so the UI can confirm what the server holds and label the
    // coverage panel — ids/roles/types, never absolute server paths or pixels.
    userAssets: Array.isArray(j.user_assets)
      ? j.user_assets.map((u) => ({
          id: u.id, role: u.role, path: u.path, originalName: u.originalName,
          assetType: u.assetType || null, classified: u.classified === true,
          sees: u.sees || null, quality: u.quality ?? null,
        }))
      : null,
    assetCoverage: j.asset_coverage || null,
    createdAt: j.created_at,
    startedAt: j.started_at,
    finishedAt: j.finished_at,
    durationMs: j.finished_at && j.started_at ? j.finished_at - j.started_at : null,
    usedFallback: j.used_fallback === 1,
    finalAttempt: j.final_attempt || null,
    composeMode: j.compose_mode || null,
    audioNotes: j.audio_notes || null,
    usage: j.usage || null,
    stageTimings: j.stage_timings || null,
    brief: j.brief || null,
    script: j.script || null,
    scriptWarnings: j.script_warnings || null,
    assets: j.assets || null,
    captions: j.captions || null,
    srtUrl: j.srt_url || null,
    vttUrl: j.vtt_url || null,
    captionConfig: j.captions_config || null,
    // Legacy jobs (pre-toggle) carry no column at all — undefined !== 0 is true, so
    // they read as voiced, which is what they were.
    voiceoverEnabled: j.voiceover_enabled !== 0,
    captionLanguage: j.caption_language || null,
    captionMode: j.caption_mode || null,
    captionQuality: j.caption_quality || null,
    localization: j.localization || null,
    languagePlan: j.language_plan || null,
    languageQa: j.language_qa || null,
    qa: j.qa || null,
    creativeReview: j.creative_review || null,
    audioReview: j.audio_review || null,
    brandReview: j.brand_review || null,
    brandCoverage: j.brand_coverage || null,
    layoutReview: j.layout_review || null,
    assetReuse: j.asset_reuse || null,
    screenshotReview: j.screenshot_review || null,
    assetHarvest: j.asset_harvest || null,
    assetUsageReport: j.asset_usage_report || null,
    validationReport: j.validation_report || null,
    continuityReport: j.continuity_report || null,
    motionPlan: j.motion_plan || null,
    motionAudit: j.motion_audit || null,
    audioReport: j.audio_report || null,
    screenshotSource: j.screenshot_source || null,
    // DELIVER-AND-FLAG. Derived on read rather than stored: it is a VIEW over signals the
    // pipeline already recorded (qa, preflight, layout, audio, motion), so it can never
    // drift from them, and improving the assessment does not require re-running old jobs.
    // Only meaningful once a film exists.
    deliveryQuality: j.status === "done" && j.video_url ? safeAssess(j) : null,
  };
}

// Fail-open (THE LAW): a disclosure must never break the API response that carries the
// film. A broken assessment costs the quality panel, not the video.
function safeAssess(j) {
  try { return require("./services/delivery_quality").assessDelivery(j); }
  catch { return null; }
}

module.exports = {
  insert(job) {
    const rec = {
      id: job.id,
      kind: job.kind || "generate",
      prompt: job.prompt,
      duration: job.duration,
      orientation: job.orientation,
      quality: job.quality,
      width: job.width,
      height: job.height,
      fps: job.fps,
      frame_pack: job.framePack || null,
      // The user's own colors, stored verbatim and read straight from the job by
      // the Art Director. It never travels through `intent` below: that object is
      // brief-model input, and a hand-picked hex that survives a model round-trip
      // is no longer the hex the user picked.
      brand_palette: job.brandPalette || null,
      // The user's own uploaded images (logo + product material) — the manifest
      // routes/projects.js staged into jobs/<id>/uploads/. Same law as the palette:
      // stored verbatim, read straight off the job (user_assets.pinUserAssets),
      // never laundered through a model. Enriched in place by the intake
      // classifier (setUserAssets) with dims + assetType.
      user_assets: job.userAssets || null,
      status: "queued",
      progress: null,
      video_url: null,
      error: null,
      used_fallback: 0,
      llm_tokens_in: 0,
      llm_tokens_out: 0,
      created_at: job.created_at,
      started_at: null,
      finished_at: null,
      client_ip: job.client_ip,
      voice_style: job.voiceStyle || null,
      // Subtitles are OPT-IN: off unless the request explicitly asks for them.
      // captions_enabled stays the fast on/off flag every composer path already
      // reads; captions_config carries the full multi-language settings object
      // (language, mode, SRT/VTT export) the Caption Director resolves against.
      captions_enabled: (job.captions === true || job.captionsEnabled === true
        || (job.captionsConfig && job.captionsConfig.enabled === true)) ? 1 : 0,
      captions_config: job.captionsConfig || null,
      // NARRATION is OPT-OUT (the inverse of captions): every film has a voice
      // unless the user says otherwise. Stored as the flag, never as an absence —
      // a job created before this field existed reads `undefined`, and every
      // consumer tests `!== false` / `!== 0`, so legacy jobs keep their voice.
      //
      // This flag governs SYNTHESIS ONLY. The script still writes narration and the
      // storyboard still reads it (see graph.storyboardPromptFromScript) — a voiceover
      // toggle that silently redesigned the scenes would be a bug, not a feature.
      voiceover_enabled: job.voiceoverEnabled === false ? 0 : 1,
      caption_language: job.captionsConfig ? job.captionsConfig.language : null,
      caption_mode: null,
      caption_quality: null,
      vtt_url: null,
      upload_path: job.uploadPath || null,
      intent: job.intent || null,
      autopilot: job.autopilot ? 1 : 0,
      render3d: job.render3d ? 1 : 0, // Three.js/WebGL composer (project pipeline reads job.render3d)
      // Per-video finish: "premium" = LLM composer (scene-kit fallback),
      // "standard" = deterministic scene-kit, null = server default.
      compose_mode: job.composeMode === "premium" || job.composeMode === "standard" ? job.composeMode : null,
      brief: null,
      script: null,
      script_warnings: null,
    };
    jobs.set(job.id, rec);
    scheduleWrite();
  },

  // ---- project (script-checkpoint) lifecycle ----

  // Intake finished: brief + draft script ready, pipeline paused for review.
  markScriptReview(id, { brief, script, warnings, framePack, usage, stageTimings }) {
    const j = jobs.get(id); if (!j) return;
    j.status = "script_review";
    j.progress = "script_review";
    j.brief = brief;
    j.script = script;
    j.script_warnings = warnings || [];
    if (framePack) j.frame_pack = framePack;
    if (usage) j.usage = usage;
    if (stageTimings) j.stage_timings = { ...(j.stage_timings || {}), ...stageTimings };
    scheduleWrite();
  },

  // Record the pack the pipeline resolved for an "auto" job (so the UI /
  // gallery filters show the real pack, not null).
  setFramePack(id, framePack) {
    const j = jobs.get(id); if (!j || !framePack) return;
    j.frame_pack = framePack;
    scheduleWrite();
  },

  // User approved (possibly edited) script: store it and requeue.
  markApproved(id, { script }) {
    const j = jobs.get(id); if (!j) return;
    j.script = script;
    j.status = "queued";
    j.progress = "approved";
    scheduleWrite();
  },

  // Audio degradation notes (silent-shipping must never be silent to the user).
  setAudioNotes(id, notes) {
    const j = jobs.get(id); if (!j) return;
    j.audio_notes = Array.isArray(notes) && notes.length ? notes : null;
    scheduleWrite();
  },

  // Asset manifest (with license/source for attribution in the UI).
  setAssets(id, assets) {
    const j = jobs.get(id); if (!j) return;
    j.assets = assets || [];
    scheduleWrite();
  },

  // QA agent verdict.
  setQa(id, qa) {
    const j = jobs.get(id); if (!j) return;
    j.qa = qa || null;
    scheduleWrite();
  },

  // Creative Director review (approved/rejected assets, scores, scene
  // assignments, notes). Surfaced to the UI via the job view (creativeReview).
  setCreativeReview(id, review) {
    const j = jobs.get(id); if (!j) return;
    j.creative_review = review || null;
    scheduleWrite();
  },

  // Audio Director plan (master loudness targets, per-scene music curve, ducking,
  // curated SFX, quality score). Surfaced to the UI via the job view (audioReview).
  setAudioReview(id, review) {
    const j = jobs.get(id); if (!j) return;
    j.audio_review = review || null;
    scheduleWrite();
  },

  // Art Director brand skin (accent-only palette derived from the site's brand
  // colors, or from the user's explicit pick). Surfaced to the UI via the job
  // view (brandReview).
  //
  // TWO callers, and the LAST wins by construction. The Art Director writes its
  // PRE-resolution pick the moment it has chosen (art_director.persistBrandReview);
  // graph.persistWornBrand then overwrites it AFTER composition with the RESOLVED skin —
  // what the composer actually wore once the palette was fit to the pack's own ground.
  // The composition node takes an in-edge from art_direction and this store is
  // single-threaded, so the resolved write lands last and is authoritative with no lock.
  // The normalization below gives both shapes one fixed audit trail: a color shifted for
  // contrast (adjusted) or refused outright (dropped) is precisely what the user must be
  // told, and the panel must never blank because a caller omitted the field. A v1 skin
  // (accents/emphasis/reason/source/provenance) rides through untouched.
  setBrandReview(id, review) {
    const j = jobs.get(id); if (!j) return;
    j.brand_review = review ? {
      ...review,
      adjusted: Array.isArray(review.adjusted) ? review.adjusted : [],
      dropped: Array.isArray(review.dropped) ? review.dropped : [],
      tier: review.tier || null,
      provenance: review.provenance || null,
    } : null;
    scheduleWrite();
  },

  // Intake classifier's enrichment of the user-upload manifest (dims, assetType,
  // quality, sees). Replaces the whole array — the classifier reads-modifies-writes
  // the manifest it was handed, and this store is single-threaded.
  setUserAssets(id, manifest) {
    const j = jobs.get(id); if (!j) return;
    j.user_assets = Array.isArray(manifest) ? manifest : null;
    scheduleWrite();
  },

  // Asset coverage — how much of the finished film's visual content came from the
  // user's own material, and where each upload landed. A DISCLOSURE, not a gate
  // (same law as brand_review): normalized so the panel never blanks on a caller
  // that omitted a field.
  setAssetCoverage(id, coverage) {
    const j = jobs.get(id); if (!j) return;
    j.asset_coverage = coverage ? {
      ...coverage,
      perAsset: Array.isArray(coverage.perAsset) ? coverage.perAsset : [],
      notes: Array.isArray(coverage.notes) ? coverage.notes : [],
      logoPlacements: Array.isArray(coverage.logoPlacements) ? coverage.logoPlacements : [],
      repairLap: coverage.repairLap || null,
    } : null;
    scheduleWrite();
  },

  // Pre-render validation report — the T2 gate's diagnostic (assets collected/approved,
  // broken-path self-heal, brand extracted, scenes covered). Disclosure by default; when
  // report.ok is false and report.blockedBy is set, the graph failed the job with this as
  // the reason (a poor render is worse than an honest error) — see graph.validateBeforeRender.
  setValidationReport(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.validation_report = report ? { ...report, checks: report.checks || {} } : null;
    scheduleWrite();
  },

  // Screenshot review — the Screenshot Intelligence disclosure: what was captured,
  // kept, dropped (blank/duplicate) at intake, and later demoted (popup/loading/
  // broken) by the Creative Director's vision verdict. Written in TWO passes into
  // ONE field, so this SHALLOW-MERGES: intake writes captured/kept/dropped/
  // suppressed; the CD later writes just { demoted } and must not clobber the base.
  // Arrays coerced so the panel never blanks (same law as setAssetCoverage).
  setScreenshotReview(id, review) {
    const j = jobs.get(id); if (!j) return;
    if (!review) { j.screenshot_review = null; scheduleWrite(); return; }
    const prev = j.screenshot_review || {};
    const merged = { ...prev, ...review };
    j.screenshot_review = {
      ...merged,
      dropped: Array.isArray(merged.dropped) ? merged.dropped : [],
      suppressed: Array.isArray(merged.suppressed) ? merged.suppressed : [],
      demoted: Array.isArray(merged.demoted) ? merged.demoted : [],
      notes: Array.isArray(merged.notes) ? merged.notes : [],
    };
    scheduleWrite();
  },

  // Website Asset Intelligence disclosure — what the harvester collected off the
  // user's own site (discovered/downloaded/kept/dropped, logos found, brand palette
  // extracted). Written once at intake. Arrays coerced so the panel never blanks
  // (same law as setAssetCoverage/setScreenshotReview).
  setAssetHarvest(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.asset_harvest = report ? {
      ...report,
      dropped: Array.isArray(report.dropped) ? report.dropped : [],
      logos: typeof report.logos === "number" ? report.logos : 0,
      brandColorsExtracted: Array.isArray(report.brandColorsExtracted) ? report.brandColorsExtracted : [],
      fontsExtracted: Array.isArray(report.fontsExtracted) ? report.fontsExtracted : [],
      brandPalette: Array.isArray(report.brandPalette) ? report.brandPalette : [],
      notes: Array.isArray(report.notes) ? report.notes : [],
    } : null;
    scheduleWrite();
  },

  // Website Asset Intelligence — the post-composition Asset Usage Report + Validation
  // Gate: what was collected vs approved, per-kind lists, brand colours/fonts, and the
  // 7 non-blocking validation checks. Arrays coerced so the panel never blanks.
  setAssetUsageReport(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.asset_usage_report = report ? {
      ...report,
      logos: Array.isArray(report.logos) ? report.logos : [],
      screenshots: Array.isArray(report.screenshots) ? report.screenshots : [],
      icons: Array.isArray(report.icons) ? report.icons : [],
      illustrations: Array.isArray(report.illustrations) ? report.illustrations : [],
      videos: Array.isArray(report.videos) ? report.videos : [],
      brandColorsExtracted: Array.isArray(report.brandColorsExtracted) ? report.brandColorsExtracted : [],
      fontsExtracted: Array.isArray(report.fontsExtracted) ? report.fontsExtracted : [],
      demotedForRelevance: Array.isArray(report.demotedForRelevance) ? report.demotedForRelevance : [],
      notes: Array.isArray(report.notes) ? report.notes : [],
    } : null;
    scheduleWrite();
  },

  // Visual Layout Director report (kept/demoted asset counts, hero scale, montage
  // budget, per-scene composition score). Surfaced to the UI via the job view.
  setLayoutReview(id, review) {
    const j = jobs.get(id); if (!j) return;
    j.layout_review = review || null;
    scheduleWrite();
  },

  // Asset Reuse Optimizer — which scenes were covered by a unique asset, which by a
  // deliberate second appearance, and which were left to the decorative brand fallback,
  // plus the per-asset ledger (usage count + the scenes each asset appears on). This is
  // the record that answers "why does this asset show up twice?" with a scored reason
  // instead of a shrug.
  setAssetReuseReport(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.asset_reuse = report || null;
    scheduleWrite();
  },

  // Which capture provider actually produced the website screenshots. Only written when
  // the hosted rescue ran, so its presence answers "why does this film's imagery look
  // different from the last one's?" without anyone reading logs.
  setScreenshotSource(id, info) {
    const j = jobs.get(id); if (!j) return;
    j.screenshot_source = info || null;
    scheduleWrite();
  },

  // Audio validation report — the deterministic check on the finished soundtrack
  // (effects mapped to scenes, duplicates, unjustified cues, ducking, loudness targets).
  // Distinct from audio_review, which is the Audio Director's own plan + self-score.
  setAudioReport(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.audio_report = report || null;
    scheduleWrite();
  },

  // Motion plan — the per-scene choreography (entrance + camera + timing) decided
  // BEFORE composition. Persisted so the post-render verification can be read against
  // what was actually intended, and so "why does every scene move the same way?" is a
  // question with an answer on the job.
  setMotionPlan(id, plan) {
    const j = jobs.get(id); if (!j) return;
    j.motion_plan = plan || null;
    scheduleWrite();
  },

  // Motion audit — plan vs. what the composition actually emitted (honoured entrances,
  // static scenes, drift). Its own key rather than a fold into validation_report,
  // because BOTH runners produce it and only the graph writes a validation record.
  setMotionAudit(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.motion_audit = report || null;
    scheduleWrite();
  },

  // Continuity report — what the reconciliation had to correct between the approved
  // script and the regenerated storyboard (retimed / re-paired / synthesized /
  // dropped scenes). Only written when something actually changed, so its presence
  // means "the scene designer drifted and we pulled it back".
  setContinuityReport(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.continuity_report = report || null;
    scheduleWrite();
  },

  // A free-text disclosure appended to the validation record — for degradations that
  // are not a preflight CHECK but that a viewer would want explained (e.g. the scene
  // designer was unavailable and the film was built from the script alone). Deduped,
  // capped, and safe to call before the validation report exists.
  setValidationNote(id, note) {
    const j = jobs.get(id); if (!j || !note) return;
    const prev = j.validation_report || { summary: "", failures: [], warnings: [], checks: {} };
    const notes = Array.isArray(prev.notes) ? prev.notes : [];
    if (!notes.includes(note)) notes.push(note);
    j.validation_report = { ...prev, notes: notes.slice(0, 8) };
    scheduleWrite();
  },

  // Caption cues + exported subtitle files + the resolved caption language/mode
  // and the quality report. Only the provided fields are updated so callers can
  // set cues early and the quality report later without clobbering.
  setCaptions(id, { cues, srtUrl, vttUrl, language, mode, quality } = {}) {
    const j = jobs.get(id); if (!j) return;
    if (cues !== undefined) j.captions = cues || [];
    if (srtUrl !== undefined) j.srt_url = srtUrl || null;
    if (vttUrl !== undefined) j.vtt_url = vttUrl || null;
    if (language !== undefined) j.caption_language = language || null;
    if (mode !== undefined) j.caption_mode = mode || null;
    if (quality !== undefined) j.caption_quality = quality || null;
    scheduleWrite();
  },

  // The unified language plan resolved by the Language Director at intake — the single source
  // of truth for voiceover/caption/on-screen-text language, font, direction, glossary, and the
  // localization-aware script directive. Every downstream stage reads it via languageDirector.getPlan.
  setLanguagePlan(id, plan) {
    const j = jobs.get(id); if (!j) return;
    j.language_plan = plan || null;
    scheduleWrite();
  },

  // On-screen text localization report (video-text language + coverage). Surfaced in
  // Premiere; best-effort disclosure, never gates a render.
  setLocalization(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.localization = report || null;
    scheduleWrite();
  },

  // Consolidated pre-render Language QA (font embedded, English leakage, coverage, consistency)
  // from the Language Director, scored against the composed HTML. Best-effort disclosure, never
  // gates a render.
  setLanguageQa(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.language_qa = report || null;
    scheduleWrite();
  },

  // Brand-color coverage report (how much of the film's color ecosystem is brand-derived).
  // Best-effort disclosure, never gates a render.
  setBrandCoverage(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.brand_coverage = report || null;
    scheduleWrite();
  },

  // Regenerate: requeue intake, optionally discarding the stored brief.
  markRequeued(id, { clearBrief = false, progress = "regenerate" } = {}) {
    const j = jobs.get(id); if (!j) return;
    j.status = "queued";
    j.progress = progress;
    j.script = null;
    j.error = null;
    if (clearBrief) j.brief = null;
    scheduleWrite();
  },

  get(id) { return shape(jobs.get(id)); },
  getRaw(id) { return jobs.get(id) || null; },

  // Recent jobs, newest first (gallery). Lightweight shape — no script/brief.
  listRecent({ limit = 30, status } = {}) {
    const all = [...jobs.values()]
      .filter((j) => !status || j.status === status)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
    return all.map((j) => ({
      jobId: j.id,
      kind: j.kind || "generate",
      status: j.status,
      title: (j.script && j.script.title) || (j.prompt || "").slice(0, 80) || null,
      videoUrl: j.video_url,
      framePack: j.frame_pack || null,
      duration: j.duration,
      orientation: j.orientation,
      createdAt: j.created_at,
    }));
  },

  markStarted(id) {
    const j = jobs.get(id); if (!j) return;
    j.status = "running";
    j.started_at = Date.now();
    scheduleWrite();
  },

  setProgress(id, progress) {
    const j = jobs.get(id); if (!j) return;
    j.progress = progress;
    scheduleWrite();
  },

  markDone(id, { videoUrl, usedFallback, tokensIn, tokensOut, usage, stageTimings, finalAttempt }) {
    const j = jobs.get(id); if (!j) return;
    j.status = "done";
    j.progress = "finalizing";
    j.video_url = videoUrl;
    j.finished_at = Date.now();
    j.used_fallback = usedFallback ? 1 : 0;
    if (usage) j.usage = mergeUsage(j.usage, usage);
    // Token counters follow the MERGED usage, not this act's tracker, or they
    // disagree with the cost report sitting next to them.
    j.llm_tokens_in  = (j.usage && j.usage.llm) ? j.usage.llm.inputTokens  : (tokensIn  || 0);
    j.llm_tokens_out = (j.usage && j.usage.llm) ? j.usage.llm.outputTokens : (tokensOut || 0);
    if (stageTimings) j.stage_timings = stageTimings;
    if (finalAttempt) j.final_attempt = finalAttempt;
    scheduleWrite();
  },

  markFailed(id, errorMsg, tokensIn = 0, tokensOut = 0, usage, stageTimings) {
    const j = jobs.get(id); if (!j) return;
    j.status = "failed";
    j.error = String(errorMsg).slice(0, 2000);
    j.finished_at = Date.now();
    if (usage) j.usage = mergeUsage(j.usage, usage);
    j.llm_tokens_in  = (j.usage && j.usage.llm) ? j.usage.llm.inputTokens  : tokensIn;
    j.llm_tokens_out = (j.usage && j.usage.llm) ? j.usage.llm.outputTokens : tokensOut;
    if (stageTimings) j.stage_timings = stageTimings;
    scheduleWrite();
  },

  countJobsSince(sinceMs) {
    let n = 0;
    for (const j of jobs.values()) if (j.created_at > sinceMs) n++;
    return n;
  },

  queueDepth() {
    let n = 0;
    for (const j of jobs.values()) {
      if (j.status === "queued" || j.status === "running") n++;
    }
    return n;
  },

  activeCount() {
    let n = 0;
    for (const j of jobs.values()) if (j.status === "running") n++;
    return n;
  },

  queuePosition(id) {
    const me = jobs.get(id);
    if (!me || me.status !== "queued") return null;
    let pos = 1;
    for (const j of jobs.values()) {
      if (j.status === "queued" && j.created_at < me.created_at) pos++;
    }
    return pos;
  },

  close() {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    persist();
  },
};
