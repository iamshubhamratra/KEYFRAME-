// VIDEO EDIT STT ENGINE — microsoft/mai-transcribe-2 (primary).
//
// WHY THIS EXISTS. Live-verified the best engine for editing (ANALYSIS.md §1): it keeps every filler
// and repeat, returns ISO languages and ~38 ms onset error on normal words, at ≈ $0.10/hour. It
// auto-detects language well, so a language is sent ONLY when the user forced one — a wrong guess
// passed in would be worse than detection.
//
// CONTRACT (engine adapter, used by chain.js):
//   { key:'mai', provider:'openrouter_stt', needsAudioFile:true, fillersTrusted:true, boundariesTrusted:true,
//     modelOf(settings), languageFor({ forced, detected }), run(ctx) -> openrouter_stt.transcribe result }
//   ctx = { chunk, chunkAudioAbs, settings, project, signal, auth, fetchImpl, forced, detected, speechRatio, timeoutMs }

const stt = require("../../ai/openrouter_stt");

const DEFAULT_MODEL = "microsoft/mai-transcribe-2";

function modelOf(settings) {
  const s = (settings && settings.providers && settings.providers.stt) || {};
  return s.openrouterModel || s.maiModel || DEFAULT_MODEL;
}

function languageFor({ forced = null } = {}) {
  return forced || null;
}

function run(ctx) {
  return stt.transcribe({
    model: modelOf(ctx.settings), audioPath: ctx.chunkAudioAbs, format: "mp3", language: languageFor(ctx),
    signal: ctx.signal, timeoutMs: ctx.timeoutMs, settings: ctx.settings, project: ctx.project, auth: ctx.auth,
    fetchImpl: ctx.fetchImpl, speechRatio: ctx.speechRatio, chunk: ctx.chunk ? ctx.chunk.index : null,
  });
}

module.exports = {
  key: "mai", provider: stt.PROVIDER, needsAudioFile: true, fillersTrusted: true, boundariesTrusted: true,
  modelOf, languageFor, run, DEFAULT_MODEL,
};
