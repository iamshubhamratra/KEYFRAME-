// Loads config.json once, merges env overrides, validates, freezes.
// Every other module reads from here — no magic numbers elsewhere.

const fs = require("node:fs");
const path = require("node:path");

const CONFIG_PATH = path.resolve(__dirname, "..", "config.json");
// Fresh deploys (Render/Oracle clone from git) have no config.json — it's
// gitignored because it can hold inline keys. Fall back to the committed
// config.example.json; real secrets are injected from env below either way.
const CONFIG_EXAMPLE_PATH = path.resolve(__dirname, "..", "config.example.json");
const ENV_PATH = path.resolve(__dirname, "..", ".env");

// Load server/.env into process.env BEFORE anything reads keys, so API keys can
// be rotated by editing one gitignored file (no config.json edits, no shell
// exports). Real shell env always wins — loadEnvFile only fills what's unset is
// NOT guaranteed by Node, so we load first and let explicit exports override by
// reapplying them afterwards. Node 20.12+/22 ships process.loadEnvFile natively.
(function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  // Preserve any keys already exported in the real shell — those take priority.
  const preset = { ...process.env };
  try {
    process.loadEnvFile(ENV_PATH);
  } catch (e) {
    console.warn(`[config] could not load ${ENV_PATH}: ${e.message}`);
    return;
  }
  for (const k of Object.keys(preset)) {
    if (preset[k] !== undefined && preset[k] !== "") process.env[k] = preset[k];
  }
})();

function loadRaw() {
  const src = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH
            : fs.existsSync(CONFIG_EXAMPLE_PATH) ? CONFIG_EXAMPLE_PATH
            : null;
  if (!src) {
    throw new Error(`no config found (looked for ${CONFIG_PATH} and ${CONFIG_EXAMPLE_PATH})`);
  }
  try {
    return JSON.parse(fs.readFileSync(src, "utf8"));
  } catch (e) {
    throw new Error(`${path.basename(src)} is not valid JSON: ${e.message}`);
  }
}

function validate(cfg) {
  const must = (cond, msg) => { if (!cond) throw new Error(`config: ${msg}`); };
  must(cfg.server, "missing server section");
  must(cfg.llm, "missing llm section");
  must(cfg.orientations && Object.keys(cfg.orientations).length, "missing orientations");
  must(cfg.qualities && Object.keys(cfg.qualities).length, "missing qualities");
  must(cfg.defaults && cfg.orientations[cfg.defaults.orientation], "defaults.orientation invalid");
  must(cfg.defaults && cfg.qualities[cfg.defaults.quality], "defaults.quality invalid");
  must(Array.isArray(cfg.allowedFps) && cfg.allowedFps.length, "allowedFps missing");
  must(cfg.server.maxDurationSec > 0, "maxDurationSec must be positive");
  must(cfg.server.minDurationSec > 0 && cfg.server.minDurationSec <= cfg.server.maxDurationSec,
       "minDurationSec invalid");
  // llm.baseUrl/apiKey are OpenRouter's, still REQUIRED because the voiceover
  // (services/tts.js) and the budget probe run there. No LLM stage uses them.
  must(cfg.llm.baseUrl, "llm.baseUrl missing");
  for (const q of Object.values(cfg.qualities)) {
    must(q.short > 0 && q.long > 0, "quality entries must have 'short' and 'long' pixel values");
  }
  if (!cfg.llm.apiKey) {
    must(process.env.OPENROUTER_API_KEY, "llm.apiKey missing and OPENROUTER_API_KEY env not set");
  }
  // KIE (llm.primary) serves EVERY LLM stage — it is no longer optional.
  must(cfg.llm.primary, "llm.primary (KIE) missing — it serves every LLM stage");
  must(cfg.llm.primary.model, "llm.primary.model missing");
  if (!cfg.llm.primary.apiKey) {
    must(process.env.KIE_API_KEY, "llm.primary.apiKey missing and KIE_API_KEY env not set");
  }
  // Each model must declare where it lives and how it is spoken to, because KIE serves
  // the gemini family on an OpenAI-compatible path and grok on the xAI Responses API.
  // A model id with no endpoint would throw at the first call of that stage — i.e.
  // mid-render — so it is caught at boot instead.
  const models = cfg.llm.primary.models || {};
  const hasLegacyBase = !!cfg.llm.primary.baseUrl;
  must(hasLegacyBase || Object.keys(models).length, "llm.primary.models missing (or a legacy llm.primary.baseUrl)");
  const referenced = new Set([
    cfg.llm.primary.model,
    cfg.llm.primary.fallbackModel,
    ...Object.values(cfg.llm.primary.stageModels || {}),
  ].filter((m) => m && m !== "default" && m !== "fast"));
  for (const id of referenced) {
    must(models[id]?.baseUrl || hasLegacyBase, `llm.primary.models["${id}"].baseUrl missing (referenced by primary.model / fallbackModel / stageModels)`);
    // A model routed to OpenRouter is billed to llm.apiKey, NOT llm.primary.apiKey.
    // Caught at boot for the same reason the endpoint map is: the alternative is a
    // stage discovering it mid-render and failing open into a template.
    if (models[id]?.provider === "openrouter") {
      must(cfg.llm.apiKey || process.env.OPENROUTER_API_KEY,
        `llm.primary.models["${id}"] is provider:"openrouter" but llm.apiKey is unset and OPENROUTER_API_KEY env not set`);
    }
  }
}

/**
 * Compute pixel dimensions from orientation + quality.
 *   horizontal → {width: long,  height: short}   (16:9)
 *   vertical   → {width: short, height: long}    (9:16)
 *   square     → {width: short, height: short}   (1:1)
 */
function dimensionsFor(orientation, quality, cfg) {
  const q = cfg.qualities[quality] || cfg.qualities[cfg.defaults.quality];
  if (orientation === "horizontal") return { width: q.long,  height: q.short };
  if (orientation === "vertical")   return { width: q.short, height: q.long  };
  return { width: q.short, height: q.short }; // square + any unknown
}

function build() {
  const cfg = loadRaw();
  // Attach a helper BEFORE freezing so it's available on the exported config.
  cfg.dimensionsFor = function (orientation, quality) {
    return dimensionsFor(orientation, quality, cfg);
  };

  // Allow env to override the API keys at runtime without editing config.json.
  if (process.env.OPENROUTER_API_KEY) {
    cfg.llm.apiKey = process.env.OPENROUTER_API_KEY;
  }
  if (process.env.KIE_API_KEY && cfg.llm.primary) {
    cfg.llm.primary.apiKey = process.env.KIE_API_KEY;
  }
  // The KIE model every non-heavy stage runs on, and the default for the four LLM
  // directors below. Per-stage overrides live in llm.primary.stageModels; see
  // services/openrouter.js.
  //
  // composer/storyboard/script were pinned to grok-4-5 and are now gemini-3-6-flash:
  // grok dominated wall-clock (storyboard alone measured 89-164s, script up to 300s)
  // for output the downstream validators gate anyway — normalizeScript, the storyboard
  // retry ladder and the composer lint/repair laps all still run unchanged.
  cfg.llm.primary = cfg.llm.primary || {};
  const kieDefaultModel = cfg.llm.primary.model || "gemini-3-6-flash";
  // Stock-media keys. PIXABAY_API_KEY feeds both the modern provider path
  // (assetProviders.pixabay) and the legacy audio.pixabayKey fallback.
  if (process.env.PIXABAY_API_KEY) {
    cfg.assetProviders = cfg.assetProviders || {};
    cfg.assetProviders.pixabay = cfg.assetProviders.pixabay || {};
    cfg.assetProviders.pixabay.apiKey = process.env.PIXABAY_API_KEY;
    cfg.audio = cfg.audio || {};
    cfg.audio.pixabayKey = process.env.PIXABAY_API_KEY;
  }
  // Pexels stock key — env parity with PIXABAY_API_KEY (previously config.json
  // only, so split deploys couldn't enable Pexels via env). Accepts PEXELS_API_KEY
  // or the shorter PEXELS alias.
  if (process.env.PEXELS_API_KEY || process.env.PEXELS) {
    cfg.assetProviders = cfg.assetProviders || {};
    cfg.assetProviders.pexels = cfg.assetProviders.pexels || {};
    cfg.assetProviders.pexels.apiKey = process.env.PEXELS_API_KEY || process.env.PEXELS;
  }
  if (process.env.FREESOUND_TOKEN) {
    cfg.audio = cfg.audio || {};
    cfg.audio.freesoundToken = process.env.FREESOUND_TOKEN;
  }
  // MEDIA_PROVIDER: promote the named stock provider to the front of the search
  // order. Accepts the provider id or its "-api"/"_api"-suffixed alias.
  if (process.env.MEDIA_PROVIDER && cfg.assetProviders && Array.isArray(cfg.assetProviders.order)) {
    const want = process.env.MEDIA_PROVIDER.replace(/[-_]api$/, "");
    if (cfg.assetProviders.order.includes(want)) {
      cfg.assetProviders.order = [want, ...cfg.assetProviders.order.filter((p) => p !== want)];
    }
  }

  // Port override (EB sets PORT env).
  if (process.env.PORT) {
    const p = Number(process.env.PORT);
    if (Number.isFinite(p) && p > 0) cfg.server.port = p;
  }

  // Concurrency env overrides. "auto" adapts to the actual host specs so a
  // mixed-type Spot fleet (t3.xlarge → c4.xlarge → c5.xlarge → t3.2xlarge)
  // gets the right concurrency regardless of which type booted.
  //
  // Memory-aware on purpose: c4.xlarge has 7.5 GB and a naïve CPU-based
  // concurrency=3 with 3 Chromium instances (~2 GB each) + Node + OS can
  // OOM. Formula: min(cpu-1, floor((ram_gb - 1.5) / 2)).
  const os = require("node:os");
  const cpuCount = (os.availableParallelism && os.availableParallelism()) || os.cpus().length;
  const memoryGb = os.totalmem() / (1024 ** 3);

  // Smart "auto" resolution that balances jobConcurrency × renderWorkers to
  // roughly match vCPU count, giving each render enough compute to finish
  // faster (worker parallelizes frame capture) without oversubscribing.
  //
  // Strategy:
  //   - RAM ≥ 12 GB AND ≥ 4 vCPU → workers=2 (halves per-job render time)
  //   - Otherwise workers=1 (older or RAM-tight boxes)
  //   - jobConcurrency = floor((cpu-1) / workers), capped by RAM headroom
  //
  // Each concurrent Chromium uses ~1.5-2 GB peak; reserve 1.5 GB for node+OS.
  function resolveAuto() {
    const okForWorkers2 = cpuCount >= 4 && memoryGb >= 12;
    const workers = okForWorkers2 ? 2 : 1;
    // Each concurrent Chromium worker ~1.5 GB peak.
    // concurrency × workers target: cpuCount (1:1 with vCPU, hyperthreading
    // absorbs spikes). RAM cap: each (concurrency × workers) eats ~1.5 GB.
    const cpuBased = Math.max(1, Math.floor(cpuCount / workers));
    const ramBased = Math.max(1, Math.floor((memoryGb - 1.5) / (1.5 * workers)));
    const concurrency = Math.max(1, Math.min(cpuBased, ramBased));
    return { concurrency, workers };
  }

  const autoSpecs = resolveAuto();

  function resolveJobConcurrency(raw) {
    if (raw === "auto") return autoSpecs.concurrency;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function resolveRenderWorkers(raw) {
    if (raw === "auto") return autoSpecs.workers;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  cfg.server.jobConcurrency = resolveJobConcurrency(
    process.env.JOB_CONCURRENCY ?? cfg.server.jobConcurrency
  );
  cfg.server.renderWorkers = resolveRenderWorkers(
    process.env.RENDER_WORKERS ?? cfg.server.renderWorkers
  );
  cfg.server.detectedCpus = cpuCount;
  cfg.server.detectedMemoryMb = Math.round(os.totalmem() / (1024 * 1024));

  if (process.env.RENDER_QUALITY) {
    cfg.server.renderQuality = process.env.RENDER_QUALITY;
  }

  // Composer mode. USE_LLM_COMPOSER toggles the LLM composition agent on the
  // agents graph. Default is now OFF: the deterministic per-pack SCENE-KIT is the
  // PRIMARY composer — it is lint-clean and overlap-free by construction and
  // carries the template's identity (fonts/motion/skin) far more reliably than
  // the freehand LLM, which drifts from the pack and needs repair laps. Set
  // USE_LLM_COMPOSER=1 to opt back into the LLM composer (scene-kit stays the
  // automatic fallback). Per-video compose_mode:"premium" still forces the LLM.
  cfg.llm.useComposer = process.env.USE_LLM_COMPOSER != null
    ? /^(1|true|yes|on)$/i.test(String(process.env.USE_LLM_COMPOSER))
    : (cfg.llm.useComposer === true);

  // Creative Director agent — reviews/curates every collected asset before
  // composition (see services/creative_director.js). Default ON; disable with
  // CREATIVE_DIRECTOR=0. Fail-open, so it never blocks a render.
  //
  // `model` is the vision model that actually ANALYZES the assets — a KIE model id,
  // registered into llm.primary.stageModels below (the call site passes only `stage`).
  // Override with CREATIVE_DIRECTOR_MODEL. Must be a vision-capable model (it is shown
  // the asset thumbnails) and must appear in llm.primary.models.
  const cdCfg = cfg.creativeDirector || {};
  cfg.creativeDirector = {
    enabled: process.env.CREATIVE_DIRECTOR != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.CREATIVE_DIRECTOR))
      : (cdCfg.enabled !== false),
    model: process.env.CREATIVE_DIRECTOR_MODEL || cdCfg.model || kieDefaultModel,
    maxPerScene: Number(cdCfg.maxPerScene) || 2,
    maxTopUp: Number(cdCfg.maxTopUp) || 3,
    chunkSize: Number(cdCfg.chunkSize) || 6,
    // QUALITY FLOOR. The director scores every asset 0-100 and, until now, never
    // compared that score to anything — approval was a pure model boolean, so a
    // 20/100 asset was placed exactly like a 95/100 one.
    //   minScore     — below this an asset is demoted to background B-roll.
    //   rejectScore  — below this, WEB STOCK is rejected outright (and deleted).
    // Owner content (uploads, the user's own site captures, their logo) is exempt:
    // the tier law makes it sovereign. Set CD_MIN_SCORE=0 to disable the floor.
    minScore: Number.isFinite(Number(process.env.CD_MIN_SCORE)) ? Number(process.env.CD_MIN_SCORE)
      : (Number.isFinite(Number(cdCfg.minScore)) ? Number(cdCfg.minScore) : 45),
    rejectScore: Number.isFinite(Number(process.env.CD_REJECT_SCORE)) ? Number(process.env.CD_REJECT_SCORE)
      : (Number.isFinite(Number(cdCfg.rejectScore)) ? Number(cdCfg.rejectScore) : 25),
  };
  // Register the stage->model mapping. This is load-bearing for DISPATCH, not just cost
  // attribution: the director call sites pass only a `stage`, so this entry is what
  // decides which KIE model answers them.
  // `user_assets` shares the Creative Director's model — it is the same vision classifier.
  cfg.llm.primary.stageModels = {
    ...(cfg.llm.primary.stageModels || {}),
    creative_director: cfg.creativeDirector.model,
    user_assets: cfg.creativeDirector.model,
  };

  // Audio Director agent — decides the per-scene audio MIX (loudness targets,
  // music energy curve, ducking, SFX curation) that audio_mix.js executes.
  // Text-only (no vision), so any capable JSON model works. Default ON; disable
  // with AUDIO_DIRECTOR=0, override the model with AUDIO_DIRECTOR_MODEL. Fail-open.
  const adCfg = cfg.audioDirector || {};
  cfg.audioDirector = {
    enabled: process.env.AUDIO_DIRECTOR != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.AUDIO_DIRECTOR))
      : (adCfg.enabled !== false),
    model: process.env.AUDIO_DIRECTOR_MODEL || adCfg.model || kieDefaultModel,
  };
  cfg.llm.primary.stageModels = { ...(cfg.llm.primary.stageModels || {}), audio_director: cfg.audioDirector.model };

  // Art Director agent — turns the website's extracted brand colors (brief.brandColors,
  // previously unused) into an ACCENT-ONLY brand skin so the video reads on-brand
  // instead of rendering the frame pack's stock palette (see services/art_director.js).
  // Text-only (it reasons over hex colors), so any capable JSON model works. Default
  // ON; disable with ART_DIRECTOR=0, override the model with ART_DIRECTOR_MODEL.
  // Fail-open: on any error the pack keeps its own accents, so it never blocks a render.
  const ardCfg = cfg.artDirector || {};
  cfg.artDirector = {
    enabled: process.env.ART_DIRECTOR != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.ART_DIRECTOR))
      : (ardCfg.enabled !== false),
    model: process.env.ART_DIRECTOR_MODEL || ardCfg.model || kieDefaultModel,
  };
  cfg.llm.primary.stageModels = { ...(cfg.llm.primary.stageModels || {}), art_director: cfg.artDirector.model };

  // Visual Layout Director — DETERMINISTIC (no LLM). Reuses the Creative Director's
  // per-asset scores to decide presentation: how many assets appear prominently
  // (quality over quantity), how big the hero is, how tightly a montage packs, and
  // where each image is cropped (see services/visual_layout_director.js). Default
  // ON; disable with VISUAL_LAYOUT_DIRECTOR=0. Fail-open — never blocks a render.
  const vldCfg = cfg.visualLayoutDirector || {};
  cfg.visualLayoutDirector = {
    enabled: process.env.VISUAL_LAYOUT_DIRECTOR != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.VISUAL_LAYOUT_DIRECTOR))
      : (vldCfg.enabled !== false),
  };

  // Asset Reuse Optimizer — the last stage of asset intelligence (services/asset_reuse.js).
  // DETERMINISTIC (no LLM, no vision, no I/O). Fills scenes the Creative Director and Visual
  // Layout Director could not cover, by cloning the best-fitting already-approved asset onto
  // them under a hard usage ceiling. It exists because spreadAcrossScenes MOVES assets and
  // never duplicates them, so its coverage ceiling is min(assets, scenes) — a six-asset film
  // with nine scenes leaves three scenes bare no matter how well everything upstream ranks.
  //
  // Default ON, because the behaviour it replaces is an empty frame. Disable with
  // ASSET_REUSE=0. Fail-open — it can never block or starve a render.
  //   maxUses  — appearances per asset (the logo is exempt when allowLogoReuse)
  //   minGap   — scenes between appearances before the recency term stops penalising
  //   minScore — below this, the scene is left to the decorative brand fallback rather
  //              than forced to wear an asset that fights it
  const arCfg = cfg.assetReuse || {};
  cfg.assetReuse = {
    enabled: process.env.ASSET_REUSE != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.ASSET_REUSE))
      : (arCfg.enabled !== false),
    maxUses: Number(process.env.ASSET_REUSE_MAX_USES) || Number(arCfg.maxUses) || 2,
    minGap: Number.isFinite(Number(arCfg.minGap)) ? Number(arCfg.minGap) : 3,
    minScore: Number.isFinite(Number(arCfg.minScore)) ? Number(arCfg.minScore) : 40,
    allowLogoReuse: arCfg.allowLogoReuse !== false,
  };

  // Screenshot Intelligence — captures cleaner shots (broadened overlay dismissal
  // at ingest), prunes blank/duplicate website screenshots deterministically before
  // they become assets (services/screenshot_intake.js), and lets the Creative
  // Director's EXISTING vision verdict demote popup/loading/broken shots. Adds NO
  // new vision call. Default ON; disable with SCREENSHOT_INTELLIGENCE=0. Fail-open —
  // never blocks a render; a bad screenshot is de-pinned/demoted, never rejected.
  // PeekShot — hosted screenshot capture (services/ingest/peekshot.js), the RESCUE path
  // for website ingest. The local headless-Chrome capture stays primary: it yields DOM
  // text, brand colours, harvested assets and capture-time obstruction geometry, none of
  // which a hosted image API can provide. PeekShot runs only when that primary produces
  // no usable screenshots — the failure mode that otherwise ships a film with no product
  // imagery at all. Every capture costs a credit, hence "rescue", not "always".
  //   SCREENSHOT_PROVIDER=auto|local|peekshot   auto (default) = local, rescue with peekshot
  //                                             peekshot = always capture with peekshot too
  //                                             local = never call peekshot
  const psCfg = cfg.peekshot || {};
  const psProvider = String(process.env.SCREENSHOT_PROVIDER || psCfg.provider || "auto").toLowerCase();
  cfg.screenshotProvider = ["auto", "local", "peekshot"].includes(psProvider) ? psProvider : "auto";
  cfg.peekshot = {
    apiKey: process.env.PEEKSHOT_API_KEY || psCfg.apiKey || "",
    projectId: process.env.PEEKSHOT_PROJECT_ID || psCfg.projectId || "",
    // Enabled when a key exists and the operator has not forced local-only.
    enabled: cfg.screenshotProvider !== "local" && !!(process.env.PEEKSHOT_API_KEY || psCfg.apiKey),
    width: Number(psCfg.width) || 1280,
    height: Number(psCfg.height) || 720,
    delaySec: Number.isFinite(Number(psCfg.delaySec)) ? Number(psCfg.delaySec) : 3,
    // Measured against the live API: a plain capture can complete in ~15s, but the queue
    // is shared and individual requests have sat past 100s while later ones finished. The
    // ceiling is generous because a queued request is not a failed one, and this path only
    // runs when the alternative is a film with no product imagery at all.
    captureTimeoutMs: Number(psCfg.captureTimeoutMs) || Number(process.env.PEEKSHOT_TIMEOUT_MS) || 180_000,
    pollMs: Number(psCfg.pollMs) || 3000,
    requestTimeoutMs: Number(psCfg.requestTimeoutMs) || 25_000,
    // A second, phone-shaped capture (the layout director routes it to a phone mockup).
    // Off by default: it doubles the credit cost of a rescue.
    mobileShot: psCfg.mobileShot === true || /^(1|true|yes|on)$/i.test(String(process.env.PEEKSHOT_MOBILE_SHOT || "")),
    mobileDevice: psCfg.mobileDevice || "iPhone 15",
    maxShots: Number(psCfg.maxShots) || 2,
  };

  const siCfg = cfg.screenshotIntelligence || {};
  cfg.screenshotIntelligence = {
    enabled: process.env.SCREENSHOT_INTELLIGENCE != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.SCREENSHOT_INTELLIGENCE))
      : (siCfg.enabled !== false),
    // A surviving overlay covering more than this % of the frame (LLM estimate,
    // a soft bucket not a precise gate) demotes the shot to background B-roll.
    popupDemotePct: Number.isFinite(siCfg.popupDemotePct) ? siCfg.popupDemotePct : 15,
    // ...and above THIS share it is rejected outright. Demotion was the only lever
    // the system had, which is how a capture with a consent banner over ~85% of the
    // frame still shipped as a "product screenshot" — just smaller and dimmer. Past
    // roughly a third of the frame, no slot or treatment rescues the shot.
    popupRejectPct: Number.isFinite(siCfg.popupRejectPct) ? siCfg.popupRejectPct : 35,
    // A shot the CD reads as loading/broken/empty is demoted regardless of coverage.
    // broken/empty escalate to a reject (nothing usable rendered at all).
    demoteOnIncomplete: siCfg.demoteOnIncomplete !== false,
  };

  // Website Asset Intelligence harvester — collects the site's OWN brand assets
  // (logo/icons/hero images) during ingest and extracts the logo palette. Deterministic
  // (no LLM/vision — no stageModels entry).
  //
  // DEFAULT ON as of the brand-identity audit. It shipped opt-in because it fetches
  // remote bytes from a user-supplied URL (a real SSRF surface), but that posture had
  // a product cost nobody had priced: the harvester is the ONLY source of the brand's
  // LOGO, so with it off every film fell back to the composer's generic glyph — a grey
  // play triangle stood in for the brand on the CTA of the audited video, and "the
  // audience should immediately recognise the brand" was unachievable by construction.
  //
  // The SSRF guard it was gated behind is in place and enforced per fetch
  // (ingest/website_assets.assertPublicUrl re-resolves and IP-pins every URL, rejecting
  // private/loopback/link-local space), the same guard the route's create-time check
  // defers to. Turn it back off with WEBSITE_HARVESTER=0 or harvester.enabled:false.
  const hCfg = cfg.harvester || {};
  cfg.harvester = {
    enabled: process.env.WEBSITE_HARVESTER != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.WEBSITE_HARVESTER))
      : (hCfg.enabled !== false),
    budgetMs: Number.isFinite(hCfg.budgetMs) ? hCfg.budgetMs : 15000, // wall-clock budget for the fetch stage (bounds network I/O; a late fetch may add one bounded probe)
    maxAssets: Number.isFinite(hCfg.maxAssets) ? hCfg.maxAssets : 24, // kept after ranking
    fetchConcurrency: Number.isFinite(hCfg.fetchConcurrency) ? hCfg.fetchConcurrency : 6,
    minDim: Number.isFinite(hCfg.minDim) ? hCfg.minDim : 64,          // raster reject floor
    approveFloor: Number.isFinite(hCfg.approveFloor) ? hCfg.approveFloor : 45, // min deterministic quality score to keep
    maxLogos: Number.isFinite(hCfg.maxLogos) ? hCfg.maxLogos : 2,     // keep the N strongest logos; demote the rest to icons
    // Per-domain cache: skip re-fetching a site's assets on a repeat job (fail-open).
    cache: hCfg.cache !== false,
    cacheTtlHours: Number.isFinite(hCfg.cacheTtlHours) ? hCfg.cacheTtlHours : 168, // 7 days
    // Bounded same-origin crawl (features/pricing/product). DEFAULT OFF — the plan's
    // lowest-lift item: homepage harvest already yields the logo/colours/fonts, and each
    // extra page adds a navigation (latency + SSRF surface). Opt-in extension point.
    crawl: hCfg.crawl === true,
    crawlMaxPages: Number.isFinite(hCfg.crawlMaxPages) ? hCfg.crawlMaxPages : 2,
  };

  // Caption Director — localizes the film's per-scene lines into the caption
  // language (see services/translate.js + caption_director.js). One batched,
  // text-only JSON call, so any capable model works. Registered here so the usage
  // tracker prices caption_director tokens at this model's rate; the dispatch uses
  // stage:"caption_director". Fail-open in the service (never blocks a render).
  const capCfg = cfg.captions || {};
  cfg.captions = {
    defaultLanguage: capCfg.defaultLanguage || "en",
    model: process.env.CAPTION_DIRECTOR_MODEL || capCfg.model || kieDefaultModel,
  };
  cfg.llm.primary.stageModels = { ...(cfg.llm.primary.stageModels || {}), caption_director: cfg.captions.model };

  // Language Director — the deterministic authority that resolves the unified language plan
  // at intake (before the brief/script) and persists it as the single source of truth. The
  // kill-switch (LANGUAGE_DIRECTOR=0) skips the early resolution + localization-aware script
  // authoring; downstream then falls back to resolving the caption config per-stage as before.
  const ldCfg = cfg.languageDirector || {};
  cfg.languageDirector = {
    enabled: process.env.LANGUAGE_DIRECTOR === "0" ? false : (ldCfg.enabled !== false),
  };

  // QA reviewer. `enabled` turns the whole agent off. `inspectNonRepairable` decides
  // whether a render that CANNOT be repaired is still reviewed.
  //
  // That second switch is the decoupling: QA used to be skipped whenever the render
  // was not repairable, which — because `repairable` is just llm.useComposer, default
  // false — meant it ran on 7 of 98 finished projects. Inspection and repairability are
  // different questions: a deterministic composer re-renders byte-identically (so a
  // repair lap is pointless), but the verdict is still the only check performed on the
  // finished MP4 rather than on the HTML that made it.
  //
  // It is not free: a review samples frames and costs ~27k vision tokens (~$0.013),
  // roughly half a 30s film's total. Set QA_INSPECT_NON_REPAIRABLE=0 to review only
  // renders a repair lap could actually fix.
  const qaCfg = cfg.qa || {};
  cfg.qa = {
    ...qaCfg,
    enabled: process.env.QA != null ? /^(1|true|yes|on)$/i.test(String(process.env.QA)) : (qaCfg.enabled !== false),
    maxRepairs: Number.isFinite(qaCfg.maxRepairs) ? qaCfg.maxRepairs : 1,
    inspectNonRepairable: process.env.QA_INSPECT_NON_REPAIRABLE != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.QA_INSPECT_NON_REPAIRABLE))
      : (qaCfg.inspectNonRepairable !== false),
  };

  // Pre-render Validation Gate — the T2 diagnostic (services in graph.validateBeforeRender).
  // Always self-heals broken asset paths (drops <img> that would render broken) and records
  // a diagnostic report via db.setValidationReport. `hardFail` promotes ONE narrow,
  // genuinely-unrecoverable state to a JOB FAILURE: the user supplied their OWN material
  // (uploads / captured website screenshots) but NONE of it survived collection AND no stock
  // was fetched either — a film that silently drops the user's product is worse than an honest
  // error. Every other check stays disclosure-only (the fail-open house law holds for quality).
  // Disable the whole gate with VALIDATION_GATE=0; keep the report but never fail with
  // VALIDATION_HARD_FAIL=0.
  const vgCfg = cfg.validationGate || {};
  cfg.validationGate = {
    enabled: process.env.VALIDATION_GATE != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.VALIDATION_GATE))
      : (vgCfg.enabled !== false),
    hardFail: process.env.VALIDATION_HARD_FAIL != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.VALIDATION_HARD_FAIL))
      : (vgCfg.hardFail !== false),
  };

  validate(cfg);

  // Resolve paths relative to project root.
  const root = path.resolve(__dirname, "..");
  cfg.paths.jobsDir = path.resolve(root, cfg.paths.jobsDir);
  cfg.paths.videosDir = path.resolve(root, cfg.paths.videosDir);
  cfg.paths.dbFile = path.resolve(root, cfg.paths.dbFile);
  cfg.paths.uploadsDir = path.resolve(root, cfg.paths.uploadsDir || "uploads");
  cfg.paths.root = root;

  return Object.freeze(cfg);
}

const config = build();

module.exports = config;
