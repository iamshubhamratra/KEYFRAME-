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
  must(cfg.llm.model, "llm.model missing");
  must(cfg.llm.baseUrl, "llm.baseUrl missing");
  for (const q of Object.values(cfg.qualities)) {
    must(q.short > 0 && q.long > 0, "quality entries must have 'short' and 'long' pixel values");
  }
  if (!cfg.llm.apiKey) {
    must(process.env.OPENROUTER_API_KEY, "llm.apiKey missing and OPENROUTER_API_KEY env not set");
  }
  // Primary provider (KIE) is optional — if absent or unkeyed, the LLM client
  // simply runs OpenRouter as the sole provider. If present, it must be complete.
  if (cfg.llm.primary) {
    must(cfg.llm.primary.baseUrl, "llm.primary.baseUrl missing");
    must(cfg.llm.primary.model, "llm.primary.model missing");
    if (!cfg.llm.primary.apiKey) {
      must(process.env.KIE_API_KEY, "llm.primary set but apiKey missing and KIE_API_KEY env not set");
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
  // `model` is the vision model that actually ANALYZES the assets. It is passed
  // explicitly to openrouter.chat(), which bypasses the KIE primary and runs this
  // exact model (falling back to llm.modelFallback only if it errors). Override
  // with CREATIVE_DIRECTOR_MODEL. Must be a vision-capable model (it is shown the
  // asset thumbnails).
  const cdCfg = cfg.creativeDirector || {};
  cfg.creativeDirector = {
    enabled: process.env.CREATIVE_DIRECTOR != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.CREATIVE_DIRECTOR))
      : (cdCfg.enabled !== false),
    model: process.env.CREATIVE_DIRECTOR_MODEL || cdCfg.model || "google/gemini-3.1-flash-lite",
    maxPerScene: Number(cdCfg.maxPerScene) || 2,
    maxTopUp: Number(cdCfg.maxTopUp) || 3,
    chunkSize: Number(cdCfg.chunkSize) || 6,
  };
  // Register the stage->model mapping so the usage tracker prices the
  // creative_director tokens at this model's rate (the dispatch itself uses the
  // explicit model arg; this is purely for accurate cost attribution).
  cfg.llm.stageModels = { ...(cfg.llm.stageModels || {}), creative_director: cfg.creativeDirector.model };

  // Audio Director agent — decides the per-scene audio MIX (loudness targets,
  // music energy curve, ducking, SFX curation) that audio_mix.js executes.
  // Text-only (no vision), so any capable JSON model works. Default ON; disable
  // with AUDIO_DIRECTOR=0, override the model with AUDIO_DIRECTOR_MODEL. Fail-open.
  const adCfg = cfg.audioDirector || {};
  cfg.audioDirector = {
    enabled: process.env.AUDIO_DIRECTOR != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.AUDIO_DIRECTOR))
      : (adCfg.enabled !== false),
    model: process.env.AUDIO_DIRECTOR_MODEL || adCfg.model || "google/gemini-3.1-flash-lite",
  };
  cfg.llm.stageModels = { ...(cfg.llm.stageModels || {}), audio_director: cfg.audioDirector.model };

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
    model: process.env.ART_DIRECTOR_MODEL || ardCfg.model || "google/gemini-3.1-flash-lite",
  };
  cfg.llm.stageModels = { ...(cfg.llm.stageModels || {}), art_director: cfg.artDirector.model };

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

  // Screenshot Intelligence — captures cleaner shots (broadened overlay dismissal
  // at ingest), prunes blank/duplicate website screenshots deterministically before
  // they become assets (services/screenshot_intake.js), and lets the Creative
  // Director's EXISTING vision verdict demote popup/loading/broken shots. Adds NO
  // new vision call. Default ON; disable with SCREENSHOT_INTELLIGENCE=0. Fail-open —
  // never blocks a render; a bad screenshot is de-pinned/demoted, never rejected.
  const siCfg = cfg.screenshotIntelligence || {};
  cfg.screenshotIntelligence = {
    enabled: process.env.SCREENSHOT_INTELLIGENCE != null
      ? /^(1|true|yes|on)$/i.test(String(process.env.SCREENSHOT_INTELLIGENCE))
      : (siCfg.enabled !== false),
    // A surviving overlay covering more than this % of the frame (LLM estimate,
    // a soft bucket not a precise gate) demotes the shot to background B-roll.
    popupDemotePct: Number.isFinite(siCfg.popupDemotePct) ? siCfg.popupDemotePct : 15,
    // A shot the CD reads as loading/broken/empty is demoted regardless of coverage.
    demoteOnIncomplete: siCfg.demoteOnIncomplete !== false,
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
