// VIDEO EDIT STT ENGINE — deepgram/nova-3 (fallback 2).
//
// WHY THIS EXISTS. Keeps repeats and is accurate on normal words, but it has NO language
// auto-detection: Spanish sent without `language` came back HTTP 200 with an empty, billed transcript
// (ANALYSIS.md §1). So a language is ALWAYS sent — forced, else detected by an earlier chunk/engine,
// else "multi" (verified to work). It also drops um/uh and folds their time into the next word, so
// neither its fillers nor its word boundaries are trusted: the chain trims swallowed pauses and runs
// disfluency recovery after it.
//
// CONTRACT (engine adapter, see mai.js): key 'deepgram', fillersTrusted:false, boundariesTrusted:false.

const stt = require("../../ai/openrouter_stt");

const DEFAULT_MODEL = "deepgram/nova-3";
const MULTI = "multi";

function modelOf(settings) {
  const s = (settings && settings.providers && settings.providers.stt) || {};
  return s.deepgramModel || DEFAULT_MODEL;
}

function languageFor({ forced = null, detected = null } = {}) {
  return forced || detected || MULTI;
}

function run(ctx) {
  return stt.transcribe({
    model: modelOf(ctx.settings), audioPath: ctx.chunkAudioAbs, format: "mp3", language: languageFor(ctx),
    signal: ctx.signal, timeoutMs: ctx.timeoutMs, settings: ctx.settings, project: ctx.project, auth: ctx.auth,
    fetchImpl: ctx.fetchImpl, speechRatio: ctx.speechRatio, chunk: ctx.chunk ? ctx.chunk.index : null,
  });
}

module.exports = {
  key: "deepgram", provider: stt.PROVIDER, needsAudioFile: true, fillersTrusted: false, boundariesTrusted: false,
  modelOf, languageFor, run, DEFAULT_MODEL, MULTI,
};
