// VIDEO EDIT PHASE-3 STAGE HANDLERS — EXTRACTING_AUDIO, TRANSCRIBING, ANALYZING_VIDEO, ANALYZING_CONTENT.
//
// WHY THIS EXISTS. These four stages turn the normalized footage into everything the director needs to know,
// and three of them spend money, so each is a thin, checkpoint-friendly wrapper over its analysis module:
//   EXTRACTING_AUDIO  (deps COMPRESSING)  analysis/audio.js → analysis/audio.json + rms.f32. Almost no voiced audio →
//                     NEEDS_ATTENTION NO_SPEECH (actions: continue without transcript · upload another), unless the
//                     user already chose to continue without a transcript.
//   TRANSCRIBING      (deps EXTRACTING_AUDIO)  analysis/stt/chain.js → transcript.words.json, then the pure structuring
//                     pass (analysis/transcript.js) → transcript.json. Every engine failing → STT_FAILED (provider, retry ·
//                     continue without transcript); the per-chunk checkpoints inside the chain mean a retry pays only for
//                     what is missing. KIE task ids are copied into the stage record for boot recovery. Skipped when the
//                     run carries continueWithout:'transcript'.
//   ANALYZING_VIDEO   (deps COMPRESSING)  analysis/technical.js (ffmpeg) + frame_sampler (ffmpeg) inside a heavy CPU slot,
//                     then analysis/faces.js (network, no slot) → video.json + faces.json. Vision failures degrade to
//                     faceTrack 'assumed'; only ffmpeg/IO failures fail the stage.
//   ANALYZING_CONTENT (deps TRANSCRIBING + ANALYZING_VIDEO)  analysis/content.js → content.json. Moderation tier-1 →
//                     NEEDS_ATTENTION CONTENT_REVIEW; LLM trouble → deterministic analysis + AI_ANALYSIS_UNAVAILABLE.
// Input hashes cover upstream output hashes, the relevant settings slices, model ids and prompt versions, so a
// resume with nothing changed makes zero provider calls. Paid work is recorded in the project cost ledger even
// when the stage then fails (the runner only books the cost of successful attempts).
//
// CONTRACT:
//   stages(deps) -> [EXTRACTING_AUDIO, TRANSCRIBING, ANALYZING_VIDEO, ANALYZING_CONTENT] defs
//   register(registry = stages.defaultRegistry, deps) -> registry
//   deps = { chat?, callJson?, auth?, kieAuth?, fetchImpl?, checkBudget?, screen? }   (tests inject; production uses config keys)
//   STAGE_VERSIONS

const fsx = require("../../fsx");
const stagesModule = require("../stages");
const { EditError, isEditError } = require("../../errors");

const STAGE_VERSIONS = Object.freeze({ EXTRACTING_AUDIO: 1, TRANSCRIBING: 1, ANALYZING_VIDEO: 1, ANALYZING_CONTENT: 1 });
const LLM_CACHE_REL = "analysis/llm-cache";

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };
const r8 = (x) => Math.round(x * 1e8) / 1e8;

function mods() {
  return {
    audio: require("../../analysis/audio"),
    chain: require("../../analysis/stt/chain"),
    transcript: require("../../analysis/transcript"),
    technical: require("../../analysis/technical"),
    faces: require("../../analysis/faces"),
    content: require("../../analysis/content"),
  };
}

function durationFor(ctx) {
  const p = ctx.project || {};
  return num(p.source && p.source.mezzanine && p.source.mezzanine.durationSec) || num(p.source && p.source.durationSec)
    || num(p.discoveries && p.discoveries.durationSec) || 300;
}

function cpuFactor(ctx) {
  const cpus = num(ctx.settings && ctx.settings.cpus) || 2;
  return Math.max(0.5, 4 / cpus);
}

function projectSettings(ctx) {
  return ctx.project && isPlain(ctx.project.settings) ? ctx.project.settings : {};
}

function forcedLanguage(ctx) {
  const l = projectSettings(ctx).language;
  return typeof l === "string" && l && l !== "auto" ? l : null;
}

function wantsNoTranscript(ctx) {
  return Array.isArray(ctx.continueWithout) && ctx.continueWithout.includes("transcript");
}

function slice(obj, keys) {
  const o = isPlain(obj) ? obj : {};
  return Object.fromEntries(keys.map((k) => [k, o[k] === undefined ? null : o[k]]));
}

// Book paid work that a failing attempt already spent (the runner books only successful results).
async function bookCost(ctx, stage, usd) {
  const c = Number(usd);
  if (!(c > 0)) return;
  try {
    await ctx.updateProject((d) => {
      d.cost = isPlain(d.cost) ? d.cost : { estimateUsd: 0, capUsd: 0, spentUsd: 0, byStage: {} };
      d.cost.spentUsd = r8((Number(d.cost.spentUsd) || 0) + c);
      d.cost.byStage = isPlain(d.cost.byStage) ? d.cost.byStage : {};
      d.cost.byStage[stage] = r8((Number(d.cost.byStage[stage]) || 0) + c);
    });
  } catch { /* fenced or store trouble: the failure itself is what matters */ }
}

function withHeavy(ctx, label) {
  return (fn) => {
    if (ctx.queue && typeof ctx.queue.heavy === "function") {
      return ctx.queue.heavy((slot) => fn(slot || {}), {
        label: `${ctx.projectId}:${label}`, signal: ctx.signal || null,
        onWait: () => ctx.progress(0, "Waiting for render capacity"),
      });
    }
    return fn(ctx.slot || { lowPriority: !!ctx.lowPriority, threads: null });
  };
}

function stages(deps = {}) {
  const d = isPlain(deps) ? deps : {};

  const EXTRACTING_AUDIO = {
    name: "EXTRACTING_AUDIO",
    version: STAGE_VERSIONS.EXTRACTING_AUDIO,
    deps: ["COMPRESSING"],
    heavy: false,
    weight: 3,
    inputHash(ctx) {
      const isl = ctx.settings && ctx.settings.providers && ctx.settings.providers.islands;
      return {
        upstream: stagesModule.upstreamFingerprint(ctx.project, ["COMPRESSING"]),
        maxIslandSec: isPlain(isl) ? num(isl.maxIslandSec) : null,
      };
    },
    budgetMs(ctx) { return Math.max(60, 30 + 0.5 * durationFor(ctx)) * 1000; },
    async run(ctx) {
      const m = mods();
      const isl = ctx.settings && ctx.settings.providers && ctx.settings.providers.islands;
      ctx.progress(2, "Listening to the audio");
      const r = await m.audio.analyzeAudio({
        projectDir: ctx.projectDir, runId: ctx.runId, signal: ctx.signal, pidFile: ctx.pidFile, lowPriority: ctx.lowPriority,
        maxIslandSec: isPlain(isl) && num(isl.maxIslandSec) ? num(isl.maxIslandSec) : undefined,
        onProgress: (p) => ctx.progress(p, null),
      });
      const notices = [...(r.notices || [])];
      if (r.noSpeech) {
        if (!wantsNoTranscript(ctx)) throw m.audio.noSpeechError();
        notices.push({ code: "NO_SPEECH", severity: "info", message: "No speech detected; continuing without a transcript." });
      }
      return { outputs: r.outputs, engine: "dsp", discoveries: r.discoveries, notices };
    },
  };

  const TRANSCRIBING = {
    name: "TRANSCRIBING",
    version: STAGE_VERSIONS.TRANSCRIBING,
    deps: ["EXTRACTING_AUDIO"],
    heavy: false,
    weight: 18,
    skip(ctx) { return wantsNoTranscript(ctx) ? "continue_without_transcript" : null; },
    inputHash(ctx) {
      const p = ctx.settings && ctx.settings.providers ? ctx.settings.providers : {};
      const comp = stagesModule.upstreamFingerprint(ctx.project, ["COMPRESSING"]).COMPRESSING;
      return {
        upstream: stagesModule.upstreamFingerprint(ctx.project, ["EXTRACTING_AUDIO"]),
        audio16k: comp ? comp.audio16k || null : null,
        stt: fsx.sha256Json(slice(p.stt, ["order", "maiModel", "whisperModel", "deepgramModel", "kieEnabled", "kieModel", "chunkTargetSec", "chunkMaxSec", "openrouterModel"])),
        islands: fsx.sha256Json(slice(p.islands, ["model", "escalationModel", "kieAudioPart", "maxIslandSec", "batchMaxSec", "batchMaxIslands"])),
        language: forcedLanguage(ctx),
      };
    },
    budgetMs(ctx) { return (120 + 4 * durationFor(ctx)) * 1000; },
    async run(ctx) {
      const m = mods();
      const audioDoc = ctx.readJson(m.audio.AUDIO_REL);
      if (!isPlain(audioDoc)) {
        throw new EditError("AUDIO_ANALYSIS_MISSING", { status: 409, errorClass: "resource", retryable: true, stage: "TRANSCRIBING", detail: "audio.json missing" });
      }
      const envelope = m.chain.loadEnvelope(ctx.projectDir, audioDoc);
      let spent = 0;
      let result;
      try {
        result = await m.chain.transcribeProject({
          projectDir: ctx.projectDir, settings: ctx.settings, project: ctx.project, signal: ctx.signal, audio: audioDoc, envelope,
          durationSec: num(audioDoc.durationSec) || undefined, forcedLanguage: forcedLanguage(ctx), tracker: ctx.tracker,
          onCost: (e) => { spent += Number(e && e.costUsd) || 0; },
          onProgress: (pct, msg) => ctx.progress(Math.min(95, pct * 0.95), msg || null),
          onProviderTask: async (task) => {
            await ctx.updateProject((doc) => {
              const rec = isPlain(doc.stages) && isPlain(doc.stages.TRANSCRIBING) ? doc.stages.TRANSCRIBING : null;
              if (!rec) return;
              const list = (Array.isArray(rec.providerTasks) ? rec.providerTasks : []).filter((t) => t && t.taskId !== task.taskId);
              list.push({ provider: task.provider, taskId: task.taskId, chunk: task.chunk, createdAt: task.createdAt, model: task.model || null });
              rec.providerTasks = list.slice(-20);
            });
          },
          auth: d.auth || null, kieAuth: d.kieAuth || d.auth || null, fetchImpl: d.fetchImpl || null, chat: d.chat || null,
          pidFile: ctx.pidFile, lowPriority: ctx.lowPriority, runId: ctx.runId, now: ctx.now,
        });
      } catch (e) {
        if (!(isEditError(e) && e.errorClass === "cancelled")) await bookCost(ctx, "TRANSCRIBING", spent);
        throw e;
      }
      await ctx.writeJson(m.transcript.WORDS_REL, m.chain.transcriptDoc(result));
      ctx.progress(97, "Finding sentences");
      const structured = m.transcript.analyzeTranscript({ projectDir: ctx.projectDir, write: true });
      const engines = [...new Set((result.chunks || []).map((c) => c.engine).filter(Boolean))];
      return {
        outputs: { words: { path: m.transcript.WORDS_REL }, transcript: { path: m.transcript.TRANSCRIPT_REL } },
        engine: engines.join("+") || null,
        fallbacks: result.fallbacks || [],
        discoveries: { ...result.discoveries, fillersFound: structured.discoveries.fillersFound },
        notices: result.notices || [],
        costUsd: Math.max(Number(result.costUsd) || 0, spent),
      };
    },
  };

  const ANALYZING_VIDEO = {
    name: "ANALYZING_VIDEO",
    version: STAGE_VERSIONS.ANALYZING_VIDEO,
    deps: ["COMPRESSING"],
    heavy: false,   // the ffmpeg part takes a heavy slot itself; the vision calls must not hold one
    weight: 8,
    inputHash(ctx) {
      const m = mods();
      const ps = projectSettings(ctx);
      return {
        upstream: stagesModule.upstreamFingerprint(ctx.project, ["COMPRESSING"]),
        vision: fsx.sha256Json(m.faces.visionSettings(ctx.settings)),
        allowCloudVision: !(isPlain(ps.privacy) && ps.privacy.allowCloudVision === false),
        promptVersion: m.faces.PROMPT_VERSION,
      };
    },
    budgetMs(ctx) {
      const vs = mods().faces.visionSettings(ctx.settings);
      const D = durationFor(ctx);
      const calls = Math.ceil(Math.min(vs.maxFaceFrames, 24) / vs.framesPerCall) * 2;
      return (60 + 1.5 * D * cpuFactor(ctx) + 90 * calls) * 1000;
    },
    async run(ctx) {
      const m = mods();
      const heavy = withHeavy(ctx, "ANALYZING_VIDEO");
      ctx.progress(1, "Looking at the video");
      const tech = await heavy((slot) => m.technical.analyzeTechnical({
        projectDir: ctx.projectDir, runId: ctx.runId, signal: ctx.signal, pidFile: ctx.pidFile,
        lowPriority: !!slot.lowPriority || ctx.lowPriority, threads: slot.threads || null,
        onProgress: (p) => ctx.progress(Math.min(30, p * 0.3), null),
      }));
      const video = tech.video;
      let spent = 0;
      let faces;
      try {
        faces = await m.faces.analyzeFaces({
          projectDir: ctx.projectDir, settings: ctx.settings, project: ctx.project, video, durationSec: video.durationSec,
          width: video.width, height: video.height, fps: video.fps, runId: ctx.runId, signal: ctx.signal, pidFile: ctx.pidFile,
          lowPriority: ctx.lowPriority, tracker: ctx.tracker, withHeavy: heavy, cacheDir: ctx.abs(LLM_CACHE_REL),
          onCost: (e) => { spent += Number(e && e.costUsd) || 0; },
          onProgress: (p, msg) => ctx.progress(30 + Math.min(100, p) * 0.7, msg || null),
          chat: d.chat || null, callJson: d.callJson || null, auth: d.auth || null, fetchImpl: d.fetchImpl || null,
          checkBudget: d.checkBudget || null, now: ctx.now,
        });
      } catch (e) {
        if (!(isEditError(e) && e.errorClass === "cancelled")) await bookCost(ctx, "ANALYZING_VIDEO", spent);
        throw e;
      }
      return {
        outputs: { video: tech.outputs.video, faces: faces.outputs.faces },
        engine: faces.engine,
        fallbacks: faces.fallbacks,
        discoveries: { ...tech.discoveries, ...faces.discoveries },
        notices: faces.notices,
        costUsd: Math.max(Number(faces.costUsd) || 0, spent),
      };
    },
  };

  const ANALYZING_CONTENT = {
    name: "ANALYZING_CONTENT",
    version: STAGE_VERSIONS.ANALYZING_CONTENT,
    deps: ["TRANSCRIBING", "ANALYZING_VIDEO"],
    heavy: false,
    weight: 6,
    inputHash(ctx) {
      const m = mods();
      const ps = projectSettings(ctx);
      const sm = ctx.settings && ctx.settings.providers && ctx.settings.providers.llm && isPlain(ctx.settings.providers.llm.stageModels)
        ? ctx.settings.providers.llm.stageModels : {};
      return {
        upstream: stagesModule.upstreamFingerprint(ctx.project, ["TRANSCRIBING", "ANALYZING_VIDEO"]),
        model: sm.ve_content || null,
        promptVersion: m.content.PROMPT_VERSION,
        goals: typeof ps.goals === "string" ? ps.goals : null,
        brand: isPlain(ps.brand) && typeof ps.brand.name === "string" ? ps.brand.name : null,
        language: forcedLanguage(ctx),
      };
    },
    budgetMs() { return 240 * 1000; },
    async run(ctx) {
      const m = mods();
      const transcriptDoc = ctx.readJson(m.transcript.TRANSCRIPT_REL);
      const skippedTranscript = !!(ctx.project && isPlain(ctx.project.stages) && isPlain(ctx.project.stages.TRANSCRIBING)
        && ctx.project.stages.TRANSCRIBING.status === "skipped");
      const video = ctx.readJson(m.technical.VIDEO_REL);
      const faces = ctx.readJson(m.faces.FACES_REL);
      ctx.progress(5, "Understanding the story");
      let spent = 0;
      let r;
      try {
        r = await m.content.analyzeContent({
          transcript: skippedTranscript ? null : transcriptDoc, words: transcriptDoc && !skippedTranscript ? transcriptDoc.words : [],
          video, faces, projectSettings: projectSettings(ctx), settings: ctx.settings, project: ctx.project, durationSec: durationFor(ctx),
          signal: ctx.signal, tracker: ctx.tracker, cacheDir: ctx.abs(LLM_CACHE_REL), now: ctx.now,
          onCost: (e) => { spent += Number(e && e.costUsd) || 0; },
          chat: d.chat || null, callJson: d.callJson || null, auth: d.auth || null, fetchImpl: d.fetchImpl || null, screen: d.screen || null,
        });
      } catch (e) {
        if (!(isEditError(e) && e.errorClass === "cancelled")) await bookCost(ctx, "ANALYZING_CONTENT", spent);
        throw e;
      }
      await ctx.writeJson(m.content.CONTENT_REL, r.content);
      return {
        outputs: { content: { path: m.content.CONTENT_REL } },
        engine: r.engine,
        fallbacks: r.fallbacks,
        discoveries: r.discoveries,
        notices: r.notices,
        costUsd: Math.max(Number(r.costUsd) || 0, spent),
      };
    },
  };

  return [EXTRACTING_AUDIO, TRANSCRIBING, ANALYZING_VIDEO, ANALYZING_CONTENT];
}

function register(registry = stagesModule.defaultRegistry, deps = {}) {
  for (const def of stages(deps)) registry.registerStage(def);
  return registry;
}

module.exports = { stages, register, STAGE_VERSIONS };
