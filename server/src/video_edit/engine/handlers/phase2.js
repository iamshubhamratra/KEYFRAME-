// VIDEO EDIT PHASE-2 STAGE HANDLERS — VALIDATING and COMPRESSING.
//
// WHY THIS EXISTS. Admission already probed the upload once, but the pipeline must not trust a
// probe taken before the file was renamed into the project, before limits changed, or before a
// crash: VALIDATING re-runs the strict probe + policy on `source/original.bin` with the demuxer
// admission forced, and publishes the facts the analysis screen shows first (duration, size, fps,
// orientation). COMPRESSING turns the untrusted original into the clean mezzanine + proxy + wavs +
// poster every later stage reads (ENGINE.md §4.7), records `source.mezzanine`, and starts the
// clock on deleting the original (`originalDeleteAfter`).
// The media modules (probe_strict / normalize) are required LAZILY at run time so the engine — and
// boot recovery — still load when they are absent or broken; a missing module becomes a config-class
// NEEDS_ATTENTION, not a crash. Tests inject stubs via register(registry, { media }).
// Once retention has deleted the original (or it is gone after a mezzanine was made), both stages are
// PINNED: an intact checkpoint is reused even when limits, versions or normalize changed, because there is
// nothing left to re-run them on. If the checkpoint is not intact either, SOURCE_MISSING is a resource-class
// NEEDS_ATTENTION (never input → FAILED, whose retention purge would delete the mezzanine — I6).
// VALIDATING hashes only the media-policy limits and writes no timestamps, so a quota or rate change never
// re-validates, and a re-validation that reaches the same verdict leaves COMPRESSING cached.
// COMPRESSING gets 2 attempts (ENGINE.md §6: one tolerant retry).
//
// CONTRACT:
//   stages({ media }) -> [VALIDATING def, COMPRESSING def]
//   register(registry = stages.defaultRegistry, { media }) -> registry
//   media = { probeStrict(filePath, { demuxer, timeoutMs, signal }), applyPolicy(probe, limits) -> { ok, reason, warnings },
//             normalizeSource({ projectDir, sourceRel, demuxer, probe, runId, signal, onProgress, settings, … }) }
//   readFacts(probe, source) -> { durationSec, width, height, fps, rotation, hasAudio, orientation } · orientationOf(w, h)
//   mediaLimits(limits) -> the subset of limits applyPolicy reads (MEDIA_LIMIT_KEYS)

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("../../fsx");
const stagesModule = require("../stages");
const { EditError, isEditError } = require("../../errors");

const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_REL = "source/original.bin";
const PROBE_REL = "source/probe.json";
const VALIDATION_REL = "analysis/validation.json";
const PROBE_TIMEOUT_MS = 20 * 1000;
const NORMALIZE_VERSION = 1;
const MEDIA_OUTPUTS = Object.freeze(["mezz", "proxy", "voice48k", "audio16k", "poster"]);
const COMPRESSING_MAX_ATTEMPTS = 2;
// Exactly the limits media/probe_strict.applyPolicy reads. Quotas, rates and global caps never change a verdict.
const MEDIA_LIMIT_KEYS = Object.freeze([
  "minDurationSec", "maxDurationSec", "minShortEdge", "warnShortEdge", "maxLongEdge", "minFps", "maxFps",
  "maxWorkload", "maxBitrateKbps", "maxAudioStreams", "maxStreams",
]);

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v) => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function lazy(modulePath, name, override) {
  if (typeof override === "function") return override;
  return (...args) => {
    let mod;
    try { mod = require(modulePath); }
    catch (e) {
      if (e && e.code === "MODULE_NOT_FOUND" && String(e.message).includes(path.basename(modulePath))) {
        throw new EditError("MEDIA_MODULE_MISSING", { status: 503, errorClass: "config", retryable: true, detail: name });
      }
      throw e;
    }
    if (typeof mod[name] !== "function") throw new EditError("MEDIA_MODULE_MISSING", { status: 503, errorClass: "config", retryable: true, detail: name });
    return mod[name](...args);
  };
}

function mediaApi(media = {}) {
  return {
    probeStrict: lazy("../../media/probe_strict", "probeStrict", media.probeStrict),
    applyPolicy: lazy("../../media/probe_strict", "applyPolicy", media.applyPolicy),
    normalizeSource: lazy("../../media/normalize", "normalizeSource", media.normalizeSource),
  };
}

function orientationOf(w, h) {
  if (!(w > 0) || !(h > 0)) return null;
  const r = w / h;
  if (Math.abs(r - 1) <= 0.02) return "square";
  return r > 1 ? "landscape" : "portrait";
}

// ProbeInfo is owned by media/probe_strict; read it defensively so a shape drift degrades facts, not the run.
function readFacts(probe, source) {
  const p = isPlain(probe) ? probe : {};
  const src = isPlain(source) ? source : {};
  const v = isPlain(p.video) ? p.video : (isPlain(src.video) ? src.video : {});
  const durationSec = num(p.durationSec) ?? num(isPlain(p.format) ? p.format.duration : null) ?? num(src.durationSec);
  const rotation = num(v.rotation) || 0;
  let width = num(v.displayWidth) ?? num(v.width);
  let height = num(v.displayHeight) ?? num(v.height);
  if (v.displayWidth == null && v.displayHeight == null && Math.abs(rotation) % 180 === 90 && width && height) [width, height] = [height, width];
  return {
    durationSec, width, height, fps: num(v.fps), rotation,
    hasAudio: !!(p.audio || (Array.isArray(p.audioStreams) && p.audioStreams.length) || src.audio),
    orientation: orientationOf(width, height),
  };
}

function warningCodes(warnings) {
  const out = [];
  for (const w of Array.isArray(warnings) ? warnings : []) {
    const code = typeof w === "string" ? w : (isPlain(w) ? w.code : null);
    out.push(typeof code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : "MEDIA_WARNING");
  }
  return [...new Set(out)].slice(0, 5);
}

function sourceOf(ctx, stage) {
  const src = ctx.project && ctx.project.source;
  if (!isPlain(src)) {
    throw new EditError("SOURCE_MISSING", { status: 409, errorClass: "input", stage, userMessage: "The uploaded video is missing." });
  }
  return src;
}

function sourceFingerprint(src) {
  return src.sha256 || `size:${num(src.sizeBytes) ?? "?"}`;
}

function mediaLimits(limits) {
  const L = isPlain(limits) ? limits : {};
  return Object.fromEntries(MEDIA_LIMIT_KEYS.map((k) => [k, L[k] === undefined ? null : L[k]]));
}

const originalDeleted = (project) => !!(project && isPlain(project.source) && project.source.originalDeletedAt);
const hasMezzanine = (project) => !!(project && isPlain(project.source) && isPlain(project.source.mezzanine) && project.source.mezzanine.path);

function originalExists(ctx) {
  try { return fs.existsSync(ctx.abs(SOURCE_REL)); } catch { return false; }
}

// Reuse an intact checkpoint whatever its inputHash says once the original can no longer be read again.
// `hasMezzanine` covers a crash between retention's unlink and its originalDeletedAt write.
function pinnedWithoutOriginal(ctx) {
  return originalDeleted(ctx.project) || (hasMezzanine(ctx.project) && !originalExists(ctx));
}

function requireOriginal(ctx, stage) {
  const file = ctx.abs(SOURCE_REL);
  if (fs.existsSync(file)) return file;
  if (originalDeleted(ctx.project) || hasMezzanine(ctx.project)) {
    // Not the user's input: the file was processed once and removed by retention. Parking as resource keeps
    // the mezzanine (retention purges work/ only for media-rejected FAILED projects).
    throw new EditError("SOURCE_MISSING", {
      status: 409, errorClass: "resource", retryable: false, stage,
      userMessage: "The original upload has been removed, so this step cannot run again.",
      extra: { reason: "ORIGINAL_DELETED", retryable: false, actions: ["delete"] },
    });
  }
  throw new EditError("SOURCE_MISSING", { status: 409, errorClass: "input", stage, userMessage: "The uploaded video is no longer available." });
}

function durationFor(ctx) {
  const p = ctx.project || {};
  return num(p.source && p.source.durationSec) || num(p.discoveries && p.discoveries.durationSec)
    || num(ctx.settings && ctx.settings.limits && ctx.settings.limits.maxDurationSec) || 300;
}

function pixelsFor(ctx) {
  const p = ctx.project || {};
  const v = (p.source && p.source.video) || {};
  const w = num(v.width) || num(p.discoveries && p.discoveries.width) || 1920;
  const h = num(v.height) || num(p.discoveries && p.discoveries.height) || 1080;
  return w * h;
}

function relInside(projectDir, p) {
  if (typeof p !== "string" || !p) return null;
  let rel = p;
  if (path.isAbsolute(p)) {
    rel = path.relative(projectDir, p);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new EditError("PATH_ESCAPE", { status: 400, errorClass: "bug", stage: "COMPRESSING", detail: "normalize output outside project" });
    }
  }
  rel = rel.split(path.sep).join("/");
  fsx.resolveInside(projectDir, rel);
  return rel;
}

function stages({ media } = {}) {
  const m = mediaApi(media);

  const VALIDATING = {
    name: "VALIDATING",
    version: 1,
    deps: [],
    heavy: false,
    weight: 2,
    inputHash(ctx) {
      const src = sourceOf(ctx, "VALIDATING");
      return { source: sourceFingerprint(src), demuxer: src.demuxer || null, limits: fsx.sha256Json(mediaLimits(ctx.settings.limits)) };
    },
    pinned: pinnedWithoutOriginal,
    budgetMs(ctx) { return Math.min(120, 15 + 0.2 * durationFor(ctx)) * 1000; },
    async run(ctx) {
      const src = sourceOf(ctx, "VALIDATING");
      const file = requireOriginal(ctx, "VALIDATING");
      ctx.progress(10, "Checking the footage");
      let probe;
      try {
        // settings + project: the per-project `probe:*` fault and the run's pid registry (not the singleton's).
        probe = await m.probeStrict(file, {
          demuxer: src.demuxer || null, timeoutMs: PROBE_TIMEOUT_MS, signal: ctx.signal, settings: ctx.settings, project: ctx.project,
        });
      } catch (e) {
        if (isEditError(e)) { if (!e.stage) e.stage = "VALIDATING"; throw e; }
        throw e;
      }
      ctx.progress(70);
      const policy = (await m.applyPolicy(probe, ctx.settings.limits)) || {};
      if (!policy.ok) {
        const reason = typeof policy.reason === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(policy.reason) ? policy.reason : "MEDIA_REJECTED";
        throw new EditError("MEDIA_REJECTED", {
          status: 422, errorClass: "input", retryable: false, stage: "VALIDATING",
          userMessage: "Not a supported video.", extra: { reason },
        });
      }
      const facts = readFacts(probe, src);
      const warnings = warningCodes(policy.warnings);
      // Deterministic: no timestamp and no limits fingerprint (that lives in the inputHash). Its hash feeds
      // COMPRESSING's inputHash, so the same verdict on the same file must be the same bytes.
      await ctx.writeJson(VALIDATION_REL, { schemaVersion: 1, ...facts, demuxer: src.demuxer || null, warnings });
      ctx.progress(100);
      return {
        outputs: { validation: { path: VALIDATION_REL } },
        engine: "ffprobe",
        discoveries: { durationSec: facts.durationSec, width: facts.width, height: facts.height, fps: facts.fps, orientation: facts.orientation },
        notices: warnings.map((code) => ({ code, severity: "warn", stage: "VALIDATING", message: null })),
      };
    },
  };

  const COMPRESSING = {
    name: "COMPRESSING",
    version: 1,
    deps: ["VALIDATING"],
    heavy: true,
    weight: 12,
    maxAttempts: COMPRESSING_MAX_ATTEMPTS,
    pinned: pinnedWithoutOriginal,
    inputHash(ctx) {
      const src = sourceOf(ctx, "COMPRESSING");
      return {
        source: sourceFingerprint(src), demuxer: src.demuxer || null,
        upstream: stagesModule.upstreamFingerprint(ctx.project, ["VALIDATING"]), normalizeVersion: NORMALIZE_VERSION,
      };
    },
    budgetMs(ctx) {
      const px = Math.max(1, pixelsFor(ctx) / 2.07e6);
      const cpus = num(ctx.settings && ctx.settings.cpus) || 2;
      const cf = Math.max(0.5, 4 / cpus);
      return Math.max(120, 3 * durationFor(ctx) * px * cf) * 1000;
    },
    async run(ctx) {
      const src = sourceOf(ctx, "COMPRESSING");
      requireOriginal(ctx, "COMPRESSING");
      const probe = ctx.readJson(PROBE_REL);
      const result = await m.normalizeSource({
        projectDir: ctx.projectDir, sourceRel: SOURCE_REL, demuxer: src.demuxer || null, probe, runId: ctx.runId,
        signal: ctx.signal, onProgress: (pct) => ctx.progress(pct), settings: ctx.settings, project: ctx.project, log: ctx.log,
        // Failure matrix (ENGINE.md §6 COMPRESSING): the retry decodes tolerantly (+genpts, ignore_err); a decode
        // error on that retry is UNDECODABLE (input → FAILED) instead of burning the remaining attempts.
        tolerant: Number(ctx.attempt) > 1,
        // Extras beyond the documented signature; normalize may ignore them.
        attempt: ctx.attempt, lowPriority: ctx.lowPriority, threads: ctx.slot ? ctx.slot.threads : null, pidFile: ctx.pidFile,
      });
      if (!isPlain(result) || !isPlain(result.mezz) || !result.mezz.path) {
        throw new EditError("NORMALIZE_OUTPUT_MISSING", { errorClass: "bug", retryable: true, stage: "COMPRESSING" });
      }
      const outputs = {};
      for (const key of MEDIA_OUTPUTS) {
        if (isPlain(result[key]) && result[key].path) outputs[key] = { path: relInside(ctx.projectDir, result[key].path) };
      }
      const mz = result.mezz;
      const at = ctx.now();
      const keepDays = num(ctx.settings.retention && ctx.settings.retention.originalDeleteDays) ?? 7;
      await ctx.updateProject((d) => {
        if (!isPlain(d.source)) return;
        d.source.mezzanine = {
          path: outputs.mezz.path, sha256: typeof mz.sha256 === "string" ? mz.sha256 : null,
          width: num(mz.width), height: num(mz.height), fps: num(mz.fps), durationSec: num(mz.durationSec),
        };
        d.source.originalDeleteAfter = at + keepDays * DAY_MS;
      });
      return {
        outputs,
        engine: result.copied ? "ffmpeg-copy" : "ffmpeg",
        discoveries: { posterReady: !!outputs.poster },
      };
    },
  };

  return [VALIDATING, COMPRESSING];
}

function register(registry = stagesModule.defaultRegistry, { media } = {}) {
  for (const def of stages({ media })) registry.registerStage(def);
  return registry;
}

module.exports = {
  stages, register, readFacts, orientationOf, mediaLimits, SOURCE_REL, VALIDATION_REL, NORMALIZE_VERSION, MEDIA_LIMIT_KEYS,
  COMPRESSING_MAX_ATTEMPTS,
};
