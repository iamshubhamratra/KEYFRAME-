// VIDEO EDIT STT ENGINE — KIE elevenlabs/speech-to-text (Scribe), disabled by default.
//
// WHY THIS EXISTS. It is the only transcription route that does not depend on OpenRouter credit or
// availability, which is exactly when the chain needs it (402 / auth / outage). But live it accepted
// tasks that sat `waiting` for > 11 min and then failed, holding credits meanwhile (ANALYSIS.md §1),
// so it runs only with `providers.stt.kieEnabled`, with a short stall limit and a hard max wait, and
// its taskId is persisted BEFORE polling (analysis/stt/chunk-<n>.kie.json + onProviderTask → stage
// record) so a resumed run re-polls the paid task instead of creating another. The completed
// resultJson shape was never observed live: words are read defensively from words | results.words |
// transcript.words (items text|word, start|start_time, end|end_time; `spacing` and `audio_event`
// items are not words).
//
// CONTRACT (engine adapter, see mai.js): key 'kie', provider 'kie', fillersTrusted:true, boundariesTrusted:true
//   run(ctx) -> { words, segments:[], language, costUsd, model, taskId }
//   extractScribeWords(result) -> { words:[{text,start,end}], language }
//   ctx adds: projectDir, stt (resolved stt settings), kieAuth, onProviderTask({ provider, taskId, chunk, createdAt, model })

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("../../fsx");
const kie = require("../../ai/kie_jobs");
const { isEditError } = require("../../errors");
const { normalizeLanguage } = require("../../ai/openrouter_stt");

const DEFAULT_MODEL = "elevenlabs/speech-to-text";
const RESUME_MAX_AGE_MS = 60 * 60 * 1000;
const ISO3 = Object.freeze({ eng: "en", spa: "es", fra: "fr", fre: "fr", deu: "de", ger: "de", por: "pt", hin: "hi", ara: "ar", jpn: "ja", ita: "it", nld: "nl", rus: "ru", zho: "zh", chi: "zh", kor: "ko", tur: "tr", pol: "pl" });

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const r3 = (x) => Math.round(x * 1000) / 1000;

function modelOf(settings) {
  const s = (settings && settings.providers && settings.providers.stt) || {};
  return s.kieModel || DEFAULT_MODEL;
}

function languageFor({ forced = null } = {}) {
  return forced || null;
}

function firstArray(...cands) {
  for (const c of cands) if (Array.isArray(c) && c.length) return c;
  return null;
}

function extractScribeWords(result) {
  if (!isPlain(result)) return { words: [], language: null };
  const nested = [result, result.resultObject, result.result, result.data].filter(isPlain);
  let items = null;
  for (const o of nested) {
    items = firstArray(o.words, isPlain(o.results) ? o.results.words : null, isPlain(o.transcript) ? o.transcript.words : null,
      Array.isArray(o.transcripts) && isPlain(o.transcripts[0]) ? o.transcripts[0].words : null);
    if (items) break;
  }
  const words = [];
  for (const it of items || []) {
    if (!isPlain(it)) continue;
    const type = String(it.type || "word").toLowerCase();
    if (type === "spacing" || type === "audio_event") continue;
    const text = String(it.text != null ? it.text : (it.word != null ? it.word : "")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const start = Number(it.start != null ? it.start : it.start_time);
    let end = Number(it.end != null ? it.end : it.end_time);
    if (!Number.isFinite(start)) continue;
    if (!Number.isFinite(end) || end < start) end = start;
    if (end - start < 0.02) end = start + 0.02;
    words.push({ text, start: r3(Math.max(0, start)), end: r3(end) });
  }
  let rawLang = null;
  for (const o of nested) { rawLang = o.language_code || o.languageCode || o.language || null; if (rawLang) break; }
  const lc = rawLang ? String(rawLang).toLowerCase() : null;
  return { words, language: lc ? (ISO3[lc] || normalizeLanguage(lc)) : null };
}

async function run(ctx) {
  const { chunk, settings, project, signal } = ctx;
  const stt = ctx.stt || (settings && settings.providers && settings.providers.stt) || {};
  const model = modelOf(settings);
  const pendingAbs = fsx.resolveInside(ctx.projectDir, `analysis/stt/chunk-${chunk.index}.kie.json`);
  const removePending = () => { try { fs.unlinkSync(pendingAbs); } catch { /* none */ } };

  const prior = fsx.readJsonSafe(pendingAbs);
  const p = prior.ok && isPlain(prior.value) ? prior.value : null;
  let taskId = null;
  if (p && typeof p.taskId === "string" && p.model === model && Math.abs(Number(p.start) - chunk.start) < 1e-3
      && Math.abs(Number(p.end) - chunk.end) < 1e-3 && Date.now() - Number(p.createdAt) < RESUME_MAX_AGE_MS) {
    taskId = p.taskId;   // a paid task already exists for this chunk: re-poll, never re-create
  } else {
    const url = await kie.uploadFile(ctx.chunkAudioAbs, {
      uploadPath: "video-edit", fileName: `c${chunk.index}.mp3`, settings, project, auth: ctx.kieAuth, signal, fetchImpl: ctx.fetchImpl,
    });
    const input = { audio_url: url, tag_audio_events: true };
    const lang = languageFor(ctx);
    if (lang) input.language_code = lang;
    const created = await kie.createTask({ model, input, settings, project, auth: ctx.kieAuth, signal, fetchImpl: ctx.fetchImpl });
    taskId = created.taskId;
    const record = { schemaVersion: 1, provider: "kie", model, taskId, chunk: chunk.index, start: chunk.start, end: chunk.end, createdAt: Date.now() };
    fsx.ensureDir(path.dirname(pendingAbs));
    fsx.writeJsonAtomic(pendingAbs, record);
    if (typeof ctx.onProviderTask === "function") {
      await ctx.onProviderTask({ provider: "kie", taskId, chunk: chunk.index, createdAt: record.createdAt, model });
    }
  }

  let polled;
  try {
    polled = await kie.pollTask(taskId, {
      pollMs: Number(stt.kiePollMs) || 3000,
      stallMs: Number(stt.kieStallMs) || (Number(stt.kieStallSec) ? Number(stt.kieStallSec) * 1000 : 60 * 1000),
      maxWaitMs: Number(stt.kieMaxWaitMs) || 240 * 1000,
      signal, settings, project, auth: ctx.kieAuth, fetchImpl: ctx.fetchImpl,
    });
  } catch (e) {
    if (!(isEditError(e) && e.errorClass === "cancelled")) removePending();   // cancelled: keep it so a resume re-polls
    throw e;
  }
  removePending();
  const parsed = extractScribeWords(polled.result);
  return { words: parsed.words, segments: [], language: parsed.language, costUsd: polled.costUsd || 0, model, taskId };
}

module.exports = {
  key: "kie", provider: "kie", needsAudioFile: true, fillersTrusted: true, boundariesTrusted: true,
  modelOf, languageFor, run, extractScribeWords, DEFAULT_MODEL,
};
