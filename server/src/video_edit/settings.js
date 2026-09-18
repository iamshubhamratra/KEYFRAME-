// VIDEO EDIT SETTINGS — the resolved server-side configuration of the AI Video Edit subsystem.
//
// WHY THIS EXISTS. config.js is shared with the template pipeline and must not change, and most
// deployments have a config.json written before AI Video Edit existed. So this module owns the
// defaults (ENGINE.md §2, API.md §8), reads an OPTIONAL `config.videoEdit` block, applies
// VIDEO_EDIT_* env overrides, and validates ONLY what is present. A bad value never crashes boot:
// it disables the feature with a logged reason code (routes answer 503 EDITS_DISABLED).
//
// It also refuses a storage directory that would expose private uploads (inside public/, jobs/,
// uploads/) or swallow the server root — edit projects hold users' raw footage.
//
// CONTRACT:
//   getSettings()                          memoized, deep-frozen resolved settings
//   reloadSettings({ config, env, cpus })  drop the memo (tests); injected sources are sticky until
//                                          the next reload
//   resolveSettings({ config, env, cpus }) pure resolver (no memo, no config require when injected)
//   validateWhenPresent(block)             -> [reasonCode] for a config.videoEdit block
// Env VIDEO_EDIT_SKIP_CONFIG=1 resolves without requiring ../config (offline tests: config.js
// loads server/.env, which tests must never pull into the process).

const os = require("node:os");
const path = require("node:path");

const WIN = process.platform === "win32";
const SERVER_ROOT = path.resolve(__dirname, "..", "..");
const HARD_MAX_DURATION_SEC = 600;

const DEFAULTS = Object.freeze({
  enabled: true,
  dir: "edits",
  indexFile: "video-edits.json",
  concurrency: 1,
  heavySlots: "auto",
  budgetScale: 1,
  limits: {
    maxUploadMb: 500, minDurationSec: 3, maxDurationSec: 300, minShortEdge: 360, warnShortEdge: 720,
    maxLongEdge: 4096, minFps: 12, maxFps: 120, maxWorkload: 3.73e10, maxBitrateKbps: 200000,
    maxAudioStreams: 4, maxStreams: 16,
    perUser: { maxProjects: 20, maxBytes: 3 * 1024 ** 3, maxRunning: 1, maxQueued: 2, createsPerDay: 10 },
    global: { createsPerDay: 50, maxStorageMb: 20480, minFreeDiskMb: 2048 },
    rates: { createPerHour: 10, opsPerMin: 120, renderPerHour: 20, searchPerHour: 10, maxStreamsPerUser: 3 },
  },
  retention: { projectTtlDays: 30, idleIntermediatesHours: 72, originalDeleteDays: 7, failedKeepDays: 7 },
  providers: {
    stt: {
      // "openrouter" is a group alias the STT chain expands to mai → whisper_turbo → deepgram (ANALYSIS.md §1, §4.2).
      order: ["openrouter", "kie", "islands"], openrouterModel: null, kieModel: "elevenlabs/speech-to-text",
      islandsModel: null, chunkTargetSec: 240, chunkMaxSec: 540, maxChunkBytes: 8e6, concurrency: 2, kieStallSec: 90,
      maiModel: "microsoft/mai-transcribe-2", whisperModel: "openai/whisper-large-v3-turbo", deepgramModel: "deepgram/nova-3",
      kieEnabled: false, kieUploadUrl: "https://kieai.redpandaai.co/api/file-stream-upload",
      kiePollMs: 3000, kieStallMs: 60000, kieMaxWaitMs: 240000, encode: "mp3 16 kHz mono 48 kbps",
    },
    islands: {
      model: "meta/muse-spark-1.3-contributor", escalationModel: "google/gemini-3.5-flash", kieAudioPart: "image_url",
      maxIslandSec: 8, batchMaxSec: 30, batchMaxIslands: 10,
    },
    // ANALYSIS.md §1: flash-lite boxes ≈ flash (IoU .97–.99) at 1/10 the price; batches escalate to flash.
    vision: { model: "google/gemini-3.5-flash-lite", escalationModel: "google/gemini-3.5-flash", imageWidth: 384, framesPerCall: 6, maxFaceFrames: 24 },
    llm: { stageModels: { ve_content: null, ve_director: null, ve_broll_judge: null, ve_qa: null } },
  },
  caps: { maxUsdPerProject: 0.5, dailyUsdCap: 5.0, minBudgetRemaining: 0.15 },
  faults: { allow: false },
});

// Numeric limit rules: [min, max, integer]. Anything present and outside → feature disabled.
const LIMIT_RULES = {
  maxUploadMb: [1, 20480, false], minDurationSec: [0.5, HARD_MAX_DURATION_SEC, false],
  maxDurationSec: [1, HARD_MAX_DURATION_SEC, false], minShortEdge: [16, 8192, true], warnShortEdge: [16, 8192, true],
  maxLongEdge: [64, 16384, true], minFps: [1, 240, false], maxFps: [1, 480, false], maxWorkload: [1e6, 1e13, false],
  maxBitrateKbps: [100, 2e6, false], maxAudioStreams: [1, 16, true], maxStreams: [2, 64, true],
};
const PER_USER_RULES = { maxProjects: [1, 10000, true], maxBytes: [1e6, 1e13, false], maxRunning: [1, 16, true], maxQueued: [0, 100, true], createsPerDay: [1, 10000, true] };
const GLOBAL_RULES = { createsPerDay: [1, 1e6, true], maxStorageMb: [100, 1e8, false], minFreeDiskMb: [0, 1e7, false] };
const RATE_RULES = { createPerHour: [1, 1e5, true], opsPerMin: [1, 1e5, true], renderPerHour: [1, 1e5, true], searchPerHour: [1, 1e5, true], maxStreamsPerUser: [1, 100, true] };
const RETENTION_RULES = { projectTtlDays: [1, 3650, false], idleIntermediatesHours: [1, 87600, false], originalDeleteDays: [0, 3650, false], failedKeepDays: [0, 3650, false] };
const CAPS_RULES = { maxUsdPerProject: [0, 1000, false], dailyUsdCap: [0, 100000, false], minBudgetRemaining: [0, 1000, false] };

const clone = (v) => JSON.parse(JSON.stringify(v));
const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const present = (v) => v !== undefined && v !== null && v !== "";

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

function checkNumber(raw, [min, max, int]) {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) return null;
  return n;
}

// Apply a rules table from `src` onto `dst`, pushing `INVALID_<scope>.<key>` for bad values.
function applyRules(dst, src, rules, scope, reasons) {
  if (!isPlain(src)) { if (present(src)) reasons.push(`INVALID_${scope}`); return; }
  for (const [k, rule] of Object.entries(rules)) {
    if (!present(src[k])) continue;
    const n = checkNumber(src[k], rule);
    if (n == null) reasons.push(`INVALID_${scope}.${k}`); else dst[k] = n;
  }
}

function parseBool(raw) {
  if (typeof raw === "boolean") return raw;
  if (/^(1|true|yes|on)$/i.test(String(raw))) return true;
  if (/^(0|false|no|off)$/i.test(String(raw))) return false;
  return null;
}

const norm = (p) => (WIN ? path.resolve(p).toLowerCase() : path.resolve(p));
function isInsideOrEqual(parent, child) {
  const a = norm(parent), b = norm(child);
  if (a === b) return true;
  const rel = path.relative(a, b);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function validateWhenPresent(block) {
  const reasons = [];
  resolveBlockInto(clone(DEFAULTS), block, reasons);
  return reasons;
}

function resolveBlockInto(s, block, reasons) {
  if (!present(block)) return s;
  if (!isPlain(block)) { reasons.push("INVALID_VIDEO_EDIT_BLOCK"); return s; }
  if (present(block.enabled)) { const b = parseBool(block.enabled); if (b == null) reasons.push("INVALID_enabled"); else s.enabled = b; }
  if (present(block.dir)) { if (typeof block.dir !== "string") reasons.push("INVALID_dir"); else s.dir = block.dir; }
  if (present(block.indexFile)) { if (typeof block.indexFile !== "string") reasons.push("INVALID_indexFile"); else s.indexFile = block.indexFile; }
  if (present(block.concurrency)) { const n = checkNumber(block.concurrency, [1, 16, true]); if (n == null) reasons.push("INVALID_concurrency"); else s.concurrency = n; }
  if (present(block.heavySlots) && block.heavySlots !== "auto") {
    const n = checkNumber(block.heavySlots, [1, 64, true]); if (n == null) reasons.push("INVALID_heavySlots"); else s.heavySlots = n;
  }
  if (present(block.limits)) {
    applyRules(s.limits, block.limits, LIMIT_RULES, "limits", reasons);
    if (isPlain(block.limits)) {
      if (present(block.limits.perUser)) applyRules(s.limits.perUser, block.limits.perUser, PER_USER_RULES, "limits.perUser", reasons);
      if (present(block.limits.global)) applyRules(s.limits.global, block.limits.global, GLOBAL_RULES, "limits.global", reasons);
      if (present(block.limits.rates)) applyRules(s.limits.rates, block.limits.rates, RATE_RULES, "limits.rates", reasons);
    }
  }
  if (present(block.retention)) applyRules(s.retention, block.retention, RETENTION_RULES, "retention", reasons);
  if (present(block.caps)) applyRules(s.caps, block.caps, CAPS_RULES, "caps", reasons);
  if (isPlain(block.faults) && present(block.faults.allow)) {
    const b = parseBool(block.faults.allow); if (b == null) reasons.push("INVALID_faults.allow"); else s.faults.allow = b;
  }
  if (present(block.providers)) {
    if (!isPlain(block.providers)) reasons.push("INVALID_providers");
    else {
      const p = block.providers;
      if (isPlain(p.stt)) {
        const stt = p.stt;
        if (present(stt.order)) {
          const ok = Array.isArray(stt.order) && stt.order.length && stt.order.every((x) => ["openrouter", "mai", "whisper_turbo", "deepgram", "kie", "islands"].includes(x));
          if (!ok) reasons.push("INVALID_providers.stt.order"); else s.providers.stt.order = [...new Set(stt.order)];
        }
        for (const k of ["openrouterModel", "kieModel", "islandsModel", "maiModel", "whisperModel", "deepgramModel"]) {
          if (present(stt[k])) { if (typeof stt[k] !== "string") reasons.push(`INVALID_providers.stt.${k}`); else s.providers.stt[k] = stt[k]; }
        }
        if (present(stt.kieEnabled)) { const b = parseBool(stt.kieEnabled); if (b == null) reasons.push("INVALID_providers.stt.kieEnabled"); else s.providers.stt.kieEnabled = b; }
        if (present(stt.kieUploadUrl)) {
          if (typeof stt.kieUploadUrl !== "string" || !/^https:\/\/[^\s]+$/i.test(stt.kieUploadUrl)) reasons.push("INVALID_providers.stt.kieUploadUrl");
          else s.providers.stt.kieUploadUrl = stt.kieUploadUrl;
        }
        applyRules(s.providers.stt, stt, {
          chunkTargetSec: [5, 600, false], chunkMaxSec: [5, 600, false], maxChunkBytes: [1e5, 2.5e7, false], concurrency: [1, 8, true], kieStallSec: [10, 600, false],
          kiePollMs: [10, 60000, true], kieStallMs: [100, 3600000, true], kieMaxWaitMs: [100, 7200000, true],
        }, "providers.stt", reasons);
      } else if (present(p.stt)) reasons.push("INVALID_providers.stt");
      if (isPlain(p.islands)) {
        for (const k of ["model", "escalationModel"]) {
          if (present(p.islands[k])) { if (typeof p.islands[k] !== "string") reasons.push(`INVALID_providers.islands.${k}`); else s.providers.islands[k] = p.islands[k]; }
        }
        if (present(p.islands.kieAudioPart)) {
          if (!["image_url", "input_audio"].includes(p.islands.kieAudioPart)) reasons.push("INVALID_providers.islands.kieAudioPart");
          else s.providers.islands.kieAudioPart = p.islands.kieAudioPart;
        }
        applyRules(s.providers.islands, p.islands, { maxIslandSec: [1, 30, false], batchMaxSec: [1, 60, false], batchMaxIslands: [1, 50, true] }, "providers.islands", reasons);
      } else if (present(p.islands)) reasons.push("INVALID_providers.islands");
      if (isPlain(p.vision)) {
        if (present(p.vision.model)) { if (typeof p.vision.model !== "string") reasons.push("INVALID_providers.vision.model"); else s.providers.vision.model = p.vision.model; }
        if (present(p.vision.escalationModel)) {
          if (typeof p.vision.escalationModel !== "string") reasons.push("INVALID_providers.vision.escalationModel"); else s.providers.vision.escalationModel = p.vision.escalationModel;
        }
        applyRules(s.providers.vision, p.vision, { framesPerCall: [1, 8, true], maxFaceFrames: [1, 120, true], imageWidth: [128, 640, true] }, "providers.vision", reasons);
      } else if (present(p.vision)) reasons.push("INVALID_providers.vision");
      if (isPlain(p.llm) && isPlain(p.llm.stageModels)) {
        for (const [k, v] of Object.entries(p.llm.stageModels)) {
          if (!/^ve_[a-z_]{1,40}$/.test(k) || (present(v) && typeof v !== "string")) reasons.push("INVALID_providers.llm.stageModels");
          else s.providers.llm.stageModels[k] = present(v) ? v : null;
        }
      } else if (isPlain(p.llm) && ["content", "director", "brollJudge", "qa"].some((k) => present(p.llm[k]))) {
        // ANALYSIS.md §1 config block spelling: { content, director, brollJudge, qa } with "default" = stage default.
      } else if (present(p.llm)) reasons.push("INVALID_providers.llm");
      if (isPlain(p.llm)) {
        for (const [alias, stage] of [["content", "ve_content"], ["director", "ve_director"], ["brollJudge", "ve_broll_judge"], ["qa", "ve_qa"]]) {
          if (!present(p.llm[alias])) continue;
          if (typeof p.llm[alias] !== "string") reasons.push(`INVALID_providers.llm.${alias}`);
          else s.providers.llm.stageModels[stage] = p.llm[alias] === "default" ? null : p.llm[alias];
        }
      }
    }
  }
  return s;
}

function applyEnv(s, env, reasons) {
  const num = (name, rule, set) => {
    if (!present(env[name])) return;
    const n = checkNumber(env[name], rule);
    if (n == null) reasons.push(`INVALID_ENV_${name}`); else set(n);
  };
  if (present(env.VIDEO_EDIT_ENABLED)) {
    const b = parseBool(env.VIDEO_EDIT_ENABLED);
    if (b == null) reasons.push("INVALID_ENV_VIDEO_EDIT_ENABLED"); else s.enabled = b;
  }
  if (present(env.VIDEO_EDIT_DIR)) s.dir = String(env.VIDEO_EDIT_DIR);
  if (present(env.VIDEO_EDIT_INDEX)) s.indexFile = String(env.VIDEO_EDIT_INDEX);
  num("VIDEO_EDIT_MAX_UPLOAD_MB", LIMIT_RULES.maxUploadMb, (n) => { s.limits.maxUploadMb = n; });
  num("VIDEO_EDIT_MAX_DURATION_SEC", LIMIT_RULES.maxDurationSec, (n) => { s.limits.maxDurationSec = n; });
  num("VIDEO_EDIT_CONCURRENCY", [1, 16, true], (n) => { s.concurrency = n; });
  num("VIDEO_EDIT_BUDGET_SCALE", [0.1, 100, false], (n) => { s.budgetScale = n; });
  if (present(env.VIDEO_EDIT_STT_MODEL)) s.providers.stt.openrouterModel = String(env.VIDEO_EDIT_STT_MODEL);
  if (present(env.VIDEO_EDIT_VISION_MODEL)) s.providers.vision.model = String(env.VIDEO_EDIT_VISION_MODEL);
}

function loadConfig(injected, env) {
  if (injected !== undefined) return injected;
  if (env.VIDEO_EDIT_SKIP_CONFIG === "1") return null;
  try { return require("../config"); } catch { return null; }
}

function resolveSettings({ config: injectedConfig, env = process.env, cpus } = {}) {
  const reasons = [];
  const config = loadConfig(injectedConfig, env);
  const cfgPaths = (config && config.paths) || {};
  const root = path.resolve(cfgPaths.root || SERVER_ROOT);
  const s = clone(DEFAULTS);

  resolveBlockInto(s, config ? config.videoEdit : undefined, reasons);
  applyEnv(s, env, reasons);

  if (s.limits.minDurationSec >= s.limits.maxDurationSec) reasons.push("INVALID_limits.duration_range");
  if (s.limits.minFps >= s.limits.maxFps) reasons.push("INVALID_limits.fps_range");
  if (s.limits.minShortEdge > s.limits.warnShortEdge) s.limits.warnShortEdge = s.limits.minShortEdge;
  if (s.providers.stt.chunkTargetSec > s.providers.stt.chunkMaxSec) reasons.push("INVALID_providers.stt.chunk_range");

  const cpuCount = Number.isInteger(cpus) && cpus > 0 ? cpus
    : ((os.availableParallelism && os.availableParallelism()) || os.cpus().length || 1);
  const heavySlots = s.heavySlots === "auto" ? Math.max(1, Math.floor(cpuCount / 2)) : s.heavySlots;

  const dir = path.resolve(root, s.dir);
  const indexFile = path.resolve(root, s.indexFile);
  const jobsDir = path.resolve(root, cfgPaths.jobsDir || "jobs");
  const uploadsDir = path.resolve(root, cfgPaths.uploadsDir || "uploads");
  const videosDir = path.resolve(root, cfgPaths.videosDir || path.join("public", "videos"));
  const publicDir = path.join(root, "public");
  // Placement: user footage must never be web-served, janitor-swept, or mixed into the root.
  if (isInsideOrEqual(dir, root)) reasons.push("DIR_CONTAINS_ROOT");
  for (const [name, p] of [["PUBLIC", publicDir], ["VIDEOS", videosDir], ["JOBS", jobsDir], ["UPLOADS", uploadsDir]]) {
    if (isInsideOrEqual(p, dir)) reasons.push(`DIR_INSIDE_${name}`);
    if (isInsideOrEqual(p, indexFile)) reasons.push(`INDEX_INSIDE_${name}`);
  }
  if (isInsideOrEqual(dir, indexFile)) reasons.push("INDEX_INSIDE_DIR");

  const production = env.NODE_ENV === "production";
  const faultsAllow = s.faults.allow === true || env.VIDEO_EDIT_FAULTS_ALLOW === "1" || !production;
  const enabled = s.enabled && reasons.length === 0;
  const disabledReason = !s.enabled ? "DISABLED_BY_CONFIG" : (reasons.length ? reasons[0] : null);

  return deepFreeze({
    enabled,
    disabledReason,
    invalid: reasons,
    nodeEnv: env.NODE_ENV || "development",
    cpus: cpuCount,
    paths: {
      root, dir, indexFile,
      stagingDir: path.join(dir, "_staging"),
      trashDir: path.join(dir, "_trash"),
      sharedDir: path.join(dir, "_shared"),
      metricsDir: path.join(dir, "_metrics"),
      runtimeDir: path.join(dir, "_runtime"),
    },
    limits: s.limits,
    retention: s.retention,
    concurrency: s.concurrency,
    heavySlots,
    budgetScale: s.budgetScale,
    providers: s.providers,
    caps: s.caps,
    faults: { allow: faultsAllow, global: present(env.VIDEO_EDIT_FAULTS) ? String(env.VIDEO_EDIT_FAULTS) : null },
    providerBaseOverride: {
      openrouter: !production && present(env.VIDEO_EDIT_OPENROUTER_BASE) ? String(env.VIDEO_EDIT_OPENROUTER_BASE) : null,
      kie: !production && present(env.VIDEO_EDIT_KIE_BASE) ? String(env.VIDEO_EDIT_KIE_BASE) : null,
    },
  });
}

let memo = null;
let injected = {};

function getSettings() {
  if (memo) return memo;
  memo = resolveSettings(injected);
  if (!memo.enabled) {
    console.warn(`[video-edit] feature disabled: ${memo.disabledReason}${memo.invalid.length > 1 ? ` (+${memo.invalid.length - 1} more)` : ""}`);
  }
  if (memo.faults.allow && memo.faults.global) console.warn("[video-edit] fault injection ACTIVE (global tokens set)");
  return memo;
}

function reloadSettings(sources = {}) {
  injected = sources && typeof sources === "object" ? { ...sources } : {};
  memo = null;
  return getSettings();
}

module.exports = { getSettings, reloadSettings, resolveSettings, validateWhenPresent, isInsideOrEqual, DEFAULTS, HARD_MAX_DURATION_SEC };
