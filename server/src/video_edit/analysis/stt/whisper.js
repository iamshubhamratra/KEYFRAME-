// VIDEO EDIT STT ENGINE — openai/whisper-large-v3-turbo (fallback 1).
//
// WHY THIS EXISTS. Cheap (≈ $0.012/hour), fast, word timestamps with a leading space (trimmed by
// ai/openrouter_stt.js) and ~100 ms onset error — but it drops most fillers and collapses repeats
// (ANALYSIS.md §1), so its transcript is never trusted for fillers: the chain always runs disfluency
// recovery after it. A language already known (forced, or detected by an earlier chunk or engine) is
// passed so a short or noisy chunk does not flip language.
//
// CONTRACT (engine adapter, see mai.js): key 'whisper_turbo', fillersTrusted:false, boundariesTrusted:true.

const stt = require("../../ai/openrouter_stt");

const DEFAULT_MODEL = "openai/whisper-large-v3-turbo";

function modelOf(settings) {
  const s = (settings && settings.providers && settings.providers.stt) || {};
  return s.whisperModel || DEFAULT_MODEL;
}

function languageFor({ forced = null, detected = null } = {}) {
  return forced || detected || null;
}

function run(ctx) {
  return stt.transcribe({
    model: modelOf(ctx.settings), audioPath: ctx.chunkAudioAbs, format: "mp3", language: languageFor(ctx),
    signal: ctx.signal, timeoutMs: ctx.timeoutMs, settings: ctx.settings, project: ctx.project, auth: ctx.auth,
    fetchImpl: ctx.fetchImpl, speechRatio: ctx.speechRatio, chunk: ctx.chunk ? ctx.chunk.index : null,
  });
}

module.exports = {
  key: "whisper_turbo", provider: stt.PROVIDER, needsAudioFile: true, fillersTrusted: false, boundariesTrusted: true,
  modelOf, languageFor, run, DEFAULT_MODEL,
};
