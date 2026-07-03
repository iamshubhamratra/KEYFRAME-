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
  // agents graph: ON (default) runs the LLM composer + lint-repair laps (the
  // "composer" token stage appears); the deterministic asset-rich scene-kit
  // becomes the fallback when the composer fails its gates. Set to 0/false to
  // make the scene-kit the PRIMARY composer (no composer LLM call) instead.
  cfg.llm.useComposer = process.env.USE_LLM_COMPOSER != null
    ? /^(1|true|yes|on)$/i.test(String(process.env.USE_LLM_COMPOSER))
    : (cfg.llm.useComposer !== false);

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
