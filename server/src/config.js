// Loads config.json once, merges env overrides, validates, freezes.
// Every other module reads from here — no magic numbers elsewhere.

const fs = require("node:fs");
const path = require("node:path");

const CONFIG_PATH = path.resolve(__dirname, "..", "config.json");

function loadRaw() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`config.json not found at ${CONFIG_PATH}`);
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (e) {
    throw new Error(`config.json is not valid JSON: ${e.message}`);
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

  validate(cfg);

  // Resolve paths relative to project root.
  const root = path.resolve(__dirname, "..");
  cfg.paths.jobsDir = path.resolve(root, cfg.paths.jobsDir);
  cfg.paths.videosDir = path.resolve(root, cfg.paths.videosDir);
  cfg.paths.dbFile = path.resolve(root, cfg.paths.dbFile);
  cfg.paths.root = root;

  return Object.freeze(cfg);
}

const config = build();

module.exports = config;
