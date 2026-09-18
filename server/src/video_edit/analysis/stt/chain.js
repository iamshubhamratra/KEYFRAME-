// VIDEO EDIT STT CHAIN — TRANSCRIBING: chunks → engines in order → validated words → one transcript.
//
// WHY THIS EXISTS. A missing transcript is the one failure the product must be loud about, and every
// single provider has a live-verified way to fail quietly (ANALYSIS.md §1): a 200 with an empty
// billed transcript, a 400 for a response format, a task that waits for 11 minutes, a model that
// drops every filler. So each chunk walks `providers.stt.order` (mai → whisper_turbo → deepgram →
// kie (only when enabled) → islands), skipping providers the process-wide breaker has opened, and a
// result is accepted only when it VALIDATES against the audio: monotonic words, ≥ 60 % of the chunk's
// speech-island time covered, ≤ 3 % of words outside the chunk, ≤ 25 characters per second of speech.
// Anything else is a provider failure and the next engine runs. Each accepted chunk is checkpointed
// (analysis/stt/chunk-<n>.json) so a retry pays only for the chunks that are missing. After merging,
// disfluency recovery re-inserts fillers the engines dropped. When every engine fails for a chunk the
// stage parks with STT_FAILED (retry · continue without transcript) — never an empty transcript.
//
// CONTRACT:
//   transcribeProject({ projectDir, settings, project, signal, audio, envelope, durationSec, forcedLanguage, tracker,
//                       onCost, onProgress, onNotice, onProviderTask, now, fetchImpl, auth, kieAuth, chat, pidFile,
//                       lowPriority, runId, wavRel, capUsd, spentUsd, recoverFillers=true })
//     audio    = analysis/audio.json object ({ floorDb, speechDb, islands:[{start,end}|{startSample,endSample}], silences })
//     envelope = { hop, rms:Float32Array(dB), zcr?, pitch? }   (loadEnvelope(projectDir, audio))
//     -> { language, languageSource:'forced'|'detected', timing:'word'|'approx', engines, words:[{i,text,norm,start,end,conf,
//          chunk,engine,isFiller?,inserted?}], chunks:[summary], costUsd, notices, fallbacks, disfluency, discoveries }
//     throws EditError STT_FAILED (provider, retryable, extra.actions ['retry','continue_without_transcript'], extra.attempts)
//            · COST_CAP_REACHED (budget) · CANCELLED / *_ABORTED (cancelled)
//   transcriptDoc(result) -> analysis/transcript.words.json body
//   validateTranscript(words, { chunkDur, islands, coverageMin, outOfRangeMax, cpsMax, tolSec }) -> { ok, reason, metrics }
//   engineOrder(sttSettings) · sttSettings(settings) · loadEnvelope(projectDir, audioDoc, { withFeatures=true }) ·
//   envelopeFromFeatures(dsp.frameFeatures result) · planFor({ durationSec, audio, envelope, settings }) · ENGINES
// Cost: provider STT calls → tracker.addLlm({ stage:'ve_stt', costUsd }) + onCost; island chat calls are recorded
// by ai/llm.js (stage 've_stt_islands'). Breakers: openrouter_stt / openrouter_stt:<model> / kie / kie:<model> and
// the island chat breakers (openrouter_chat, kie_chat) — 402 and key-wide 401/403 also close island chat on the same key.

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("../../fsx");
const faults = require("../../faults");
const timeline = require("../../plan/timeline");
const { EditError, isEditError } = require("../../errors");
const { getBreaker, nextUtcMidnight } = require("../../providers/breaker");
const openrouterStt = require("../../ai/openrouter_stt");
const dsp = require("../dsp");
const chunker = require("./chunker");
const merge = require("./merge");
const disfluency = require("./disfluency");
const islandChat = require("./island_chat");

const ENGINES = Object.freeze({
  mai: require("./mai"),
  whisper_turbo: require("./whisper"),
  deepgram: require("./deepgram"),
  kie: require("./kie_scribe"),
  islands: Object.freeze({ key: "islands", provider: "islands", needsAudioFile: false, fillersTrusted: true, boundariesTrusted: true }),
});
const ORDER_GROUPS = Object.freeze({ openrouter: Object.freeze(["mai", "whisper_turbo", "deepgram"]) });
const DEFAULT_ORDER = Object.freeze(["mai", "whisper_turbo", "deepgram", "kie", "islands"]);
const STT_DEFAULTS = Object.freeze({
  chunkTargetSec: 240, chunkMaxSec: 540, concurrency: 2, kieEnabled: false, kiePollMs: 3000, kieStallMs: 60 * 1000, kieMaxWaitMs: 240 * 1000,
});
const VALIDATION = Object.freeze({ coverageMin: 0.6, outOfRangeMax: 0.03, cpsMax: 25, tolSec: 0.15, disorderMax: 0.02, minSpeechSec: 0.5 });
const STAGE = "TRANSCRIBING";
const CHUNK_SCHEMA_VERSION = 1;
const ACTIONS = Object.freeze(["retry", "continue_without_transcript"]);

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const r3 = (x) => Math.round(x * 1000) / 1000;
const r8 = (x) => Math.round(x * 1e8) / 1e8;

function sttSettings(settings) {
  const s = { ...STT_DEFAULTS, ...((settings && settings.providers && isPlain(settings.providers.stt)) ? settings.providers.stt : {}) };
  if (!(Number(s.kieStallMs) > 0)) s.kieStallMs = Number(s.kieStallSec) > 0 ? Number(s.kieStallSec) * 1000 : STT_DEFAULTS.kieStallMs;
  s.concurrency = Math.max(1, Math.floor(Number(s.concurrency) || STT_DEFAULTS.concurrency));
  return s;
}

function engineOrder(stt) {
  const raw = Array.isArray(stt && stt.order) && stt.order.length ? stt.order : DEFAULT_ORDER;
  const out = [];
  for (const k of raw) for (const e of ORDER_GROUPS[k] || [k]) if (ENGINES[e] && !out.includes(e)) out.push(e);
  return out.filter((e) => e !== "kie" || (stt && stt.kieEnabled === true));
}

function envelopeFromFeatures(features) {
  if (!features || !features.rmsDb || !features.rmsDb.length) return null;
  return { hop: features.hop || 0.01, rms: features.rmsDb, zcr: features.zcr || null, pitch: features.pitch || null };
}

// analysis/audio.js persists only the RMS envelope (analysis/rms.f32); disfluency detection also wants ZCR and
// pitch strength, which analysis/dsp.frameFeatures recomputes deterministically from the same 16 kHz PCM.
function loadEnvelope(projectDir, audioDoc = null, { wavRel = chunker.WAV_REL, withFeatures = true } = {}) {
  const doc = isPlain(audioDoc) ? audioDoc : {};
  if (withFeatures) {
    try {
      const pcm = dsp.readWav(fsx.resolveInside(projectDir, wavRel));
      const env = envelopeFromFeatures(dsp.frameFeatures(pcm.samples, pcm.sampleRate, { hopSec: 0.01, winSec: 0.02 }));
      if (env) return env;
    } catch { /* fall back to the stored RMS envelope */ }
  }
  try {
    const buf = fs.readFileSync(fsx.resolveInside(projectDir, doc.envelopeFile || "analysis/rms.f32"));
    const rms = new Float32Array(Math.floor(buf.length / 4));
    for (let i = 0; i < rms.length; i++) rms[i] = buf.readFloatLE(i * 4);
    return rms.length ? { hop: Number(doc.hopSec) > 0 ? Number(doc.hopSec) : 0.01, rms, zcr: null, pitch: null } : null;
  } catch { return null; }
}

function islandsFrom(audio) {
  if (!isPlain(audio) || !Array.isArray(audio.islands)) return null;
  const sr = Number(audio.sampleRate) > 0 ? Number(audio.sampleRate) : chunker.SAMPLE_RATE;
  return audio.islands.map((i) => {
    if (!isPlain(i)) return null;
    let s = Number(i.start), e = Number(i.end);
    if (!Number.isFinite(s) && Number.isFinite(Number(i.startSample))) s = Number(i.startSample) / sr;
    if (!Number.isFinite(e) && Number.isFinite(Number(i.endSample))) e = Number(i.endSample) / sr;
    return Number.isFinite(s) && Number.isFinite(e) && e > s ? { start: s, end: e } : null;
  }).filter(Boolean).sort((a, b) => a.start - b.start);
}

function clipIslands(islands, chunk) {
  if (!islands) return null;
  const out = [];
  for (const i of islands) {
    const s = Math.max(i.start, chunk.start), e = Math.min(i.end, chunk.end);
    if (e > s) out.push({ start: s - chunk.start, end: e - chunk.start });
  }
  return out;
}

function validateTranscript(words, opts = {}) {
  const { chunkDur, islands = null } = opts;
  const cfg = { ...VALIDATION, ...opts };
  const list = Array.isArray(words) ? words.filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end)) : [];
  const speechSec = islands ? islands.reduce((a, i) => a + Math.max(0, Math.min(i.end, chunkDur) - Math.max(0, i.start)), 0) : null;
  const metrics = { words: list.length, speechSec: speechSec == null ? null : r3(speechSec), coverage: null, outOfRange: 0, cps: 0, disorder: 0 };
  const fail = (reason) => ({ ok: false, reason, metrics });
  if (!list.length) {
    if (speechSec != null && speechSec < cfg.minSpeechSec) return { ok: true, reason: null, metrics };
    return fail("EMPTY");
  }
  let disorder = 0;
  for (let k = 1; k < list.length; k++) if (list[k].start < list[k - 1].start - 0.05) disorder++;
  metrics.disorder = r3(disorder / list.length);
  if (metrics.disorder > cfg.disorderMax) return fail("NON_MONOTONIC");
  const sorted = list.slice().sort((a, b) => a.start - b.start);
  if (sorted.some((w) => w.end < w.start - 1e-6)) return fail("NON_MONOTONIC");
  const out = sorted.filter((w) => w.start < -0.05 || w.end > chunkDur + 0.5).length;
  metrics.outOfRange = r3(out / sorted.length);
  if (metrics.outOfRange > cfg.outOfRangeMax) return fail("OUT_OF_RANGE");
  if (speechSec != null && speechSec >= cfg.minSpeechSec) {
    const spans = [];
    for (const w of sorted) {
      const a = w.start - cfg.tolSec, b = w.end + cfg.tolSec;
      const last = spans[spans.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b); else spans.push([a, b]);
    }
    let covered = 0;
    for (const i of islands) {
      for (const [a, b] of spans) covered += Math.max(0, Math.min(b, i.end) - Math.max(a, i.start));
    }
    metrics.coverage = r3(covered / speechSec);
    if (metrics.coverage < cfg.coverageMin) return fail("LOW_COVERAGE");
  }
  const chars = sorted.reduce((a, w) => a + String(w.text || "").replace(/\s+/g, "").length, 0);
  metrics.cps = r3(chars / Math.max(1, speechSec != null && speechSec >= cfg.minSpeechSec ? speechSec : chunkDur));
  if (metrics.cps > cfg.cpsMax) return fail("TOO_FAST");
  return { ok: true, reason: null, metrics };
}

function effectiveCap({ capUsd, settings, project }) {
  const vals = [capUsd, project && project.settings ? project.settings.maxCostUsd : null, settings && settings.caps ? settings.caps.maxUsdPerProject : null];
  const f = faults.faultFor("budget", { settings, project });
  if (f && f.mode === "cap") vals.push(f.arg);
  const finite = vals.filter((v) => v !== null && v !== undefined && v !== "").map(Number).filter((v) => Number.isFinite(v) && v >= 0);
  return finite.length ? Math.min(...finite) : null;
}

function engineGate(provider, model, now) {
  const P = getBreaker(provider, { now });
  const M = getBreaker(`${provider}:${model}`, { now });
  const ps = P.state(), ms = M.state();
  if (ps.state === "open" || ms.state === "open") return { ok: false, reason: "BREAKER_OPEN", openUntil: Math.max(ps.openUntil || 0, ms.openUntil || 0) };
  if (!P.canRequest()) return { ok: false, reason: "BREAKER_OPEN" };
  if (!M.canRequest()) { P.recordFailure("cancelled"); return { ok: false, reason: "BREAKER_OPEN" }; }
  const sameKeyChat = provider === "openrouter_stt" ? "openrouter_chat" : null;
  return {
    ok: true,
    success() { P.recordSuccess(); M.recordSuccess(); },
    release() { P.recordFailure("cancelled"); M.recordFailure("cancelled"); },
    fail(err) {
      const cls = err.errorClass;
      const extra = err.extra || {};
      if (cls === "cancelled" || cls === "bug" || cls === "input") { this.release(); return; }
      if (cls === "budget") {
        const untilMs = nextUtcMidnight(now());
        P.recordFailure("budget", { untilMs });
        M.recordFailure("cancelled");
        if (sameKeyChat) getBreaker(sameKeyChat, { now }).recordFailure("budget", { untilMs });
        return;
      }
      if (cls === "config" && (extra.scope === "provider" || (!extra.scope && (extra.httpStatus === 401 || extra.httpStatus === 403)))) {
        P.recordFailure("config");
        M.recordFailure("cancelled");
        if (sameKeyChat) getBreaker(sameKeyChat, { now }).recordFailure("config");
        return;
      }
      M.recordFailure(cls, Number.isFinite(extra.retryAfterSec) ? { retryAfterSec: extra.retryAfterSec } : {});
      P.recordFailure("cancelled");
    },
  };
}

function cancelledError(detail = "aborted") {
  return new EditError("CANCELLED", { status: 409, errorClass: "cancelled", stage: STAGE, detail });
}

function planFor({ durationSec, audio, envelope, settings }) {
  const stt = sttSettings(settings);
  const islands = islandsFrom(audio);
  const silences = isPlain(audio) && Array.isArray(audio.silences)
    ? audio.silences.filter((s) => isPlain(s) && Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end))).map((s) => ({ start: Number(s.start), end: Number(s.end) }))
    : null;
  return chunker.planChunks({ durationSec, islands: islands || [], silences, envelope, targetSec: stt.chunkTargetSec, maxSec: stt.chunkMaxSec });
}

async function transcribeProject(opts = {}) {
  const {
    projectDir, settings, project = null, signal = null, audio = null, envelope = null, durationSec = null, forcedLanguage = null,
    tracker = null, onCost = null, onProgress = null, onNotice = null, onProviderTask = null, now = Date.now, fetchImpl = null,
    auth = null, kieAuth = null, chat = null, pidFile, lowPriority = false, runId = null, wavRel = chunker.WAV_REL,
    capUsd = null, spentUsd = null, recoverFillers = true,
  } = opts;
  if (!projectDir || !settings) throw new EditError("STT_BAD_REQUEST", { errorClass: "bug", stage: STAGE, detail: "projectDir and settings required" });
  const stt = sttSettings(settings);
  const abs = (rel) => fsx.resolveInside(projectDir, rel);
  const wavAbs = abs(wavRel);
  if (!fs.existsSync(wavAbs)) throw new EditError("AUDIO_MISSING", { status: 409, errorClass: "input", stage: STAGE, userMessage: "The extracted audio is missing." });
  const D = Number(durationSec) > 0 ? Number(durationSec) : chunker.readWavInfo(wavAbs).durationSec;
  const islands = islandsFrom(audio);
  const envOk = !!(envelope && envelope.rms && envelope.rms.length);
  let floorDb = isPlain(audio) && Number.isFinite(Number(audio.floorDb)) ? Number(audio.floorDb) : null;
  let speechDb = isPlain(audio) && Number.isFinite(Number(audio.speechDb)) ? Number(audio.speechDb) : null;
  if (envOk && (floorDb == null || speechDb == null)) {
    const st = timeline.envStats(envelope.rms, [], { hop: envelope.hop || 0.01 });
    if (floorDb == null) floorDb = st.floorDb;
    if (speechDb == null) speechDb = st.speechDb;
  }
  const forced = openrouterStt.normalizeLanguage(forcedLanguage === "auto" ? null : forcedLanguage);
  const order = engineOrder(stt).map((k) => ENGINES[k]);
  const plan = planFor({ durationSec: D, audio, envelope, settings });
  const cap = effectiveCap({ capUsd, settings, project });
  const spent = Number.isFinite(Number(spentUsd)) ? Number(spentUsd) : Number((project && project.cost && project.cost.spentUsd) || 0);
  const chatImpl = typeof chat === "function" ? chat
    : (settings.providerBaseOverride && settings.providerBaseOverride.openrouter ? openrouterStt.createDirectChat({ settings, auth, fetchImpl }) : null);
  const cacheDir = abs("analysis/llm-cache");
  let pcmCache = null;
  const getPcm = () => { if (!pcmCache) pcmCache = dsp.readWav(wavAbs); return pcmCache; };

  const state = { detected: null, costUsd: 0, notices: new Map(), fallbacks: [], budgetPromise: null, done: 0 };
  const notice = (code, severity, message) => {
    if (state.notices.has(code)) return;
    const n = { code, severity, stage: STAGE, message };
    state.notices.set(code, n);
    if (typeof onNotice === "function") { try { onNotice(n); } catch { /* observer */ } }
  };
  const progress = (pct, message) => { if (typeof onProgress === "function") { try { onProgress(pct, message); } catch { /* enhancement */ } } };
  const addCost = (usd, meta) => {
    const c = Number(usd);
    if (!(c > 0)) return;
    state.costUsd += c;
    if (tracker && typeof tracker.addLlm === "function") tracker.addLlm({ inputTokens: 0, outputTokens: 0, stage: "ve_stt", costUsd: c });
    if (typeof onCost === "function") onCost({ stage: "ve_stt", costUsd: c, ...meta });
  };
  const islandsCost = (chunkIndex) => (entry) => {
    state.costUsd += Number(entry && entry.costUsd) || 0;
    if (typeof onCost === "function") onCost({ ...entry, engine: "islands", chunk: chunkIndex });
  };
  const capGuard = () => {
    if (cap != null && spent + state.costUsd >= cap - 1e-9) {
      throw new EditError("COST_CAP_REACHED", {
        status: 429, errorClass: "budget", retryable: true, stage: STAGE, userMessage: "This project's AI budget is used up.",
        extra: { actions: [...ACTIONS], capUsd: cap, spentUsd: r8(spent + state.costUsd) },
      });
    }
  };
  const budgetOnce = () => {
    if (!state.budgetPromise) {
      state.budgetPromise = (async () => {
        let b = null;
        try { b = await openrouterStt.checkBudget({ settings, auth, fetchImpl, project }); } catch { b = null; }
        const min = settings.caps && Number.isFinite(Number(settings.caps.minBudgetRemaining)) ? Number(settings.caps.minBudgetRemaining) : 0.15;
        if (b && Number.isFinite(b.remaining) && b.remaining < min) {
          const untilMs = nextUtcMidnight(now());
          getBreaker("openrouter_stt", { now }).recordFailure("budget", { untilMs });
          getBreaker("openrouter_chat", { now }).recordFailure("budget", { untilMs });
        }
      })();
    }
    return state.budgetPromise;
  };

  const chunkRecords = new Array(plan.length);

  async function runIslandsEngine(chunk, relIslands) {
    const cfg = islandChat.islandSettings(settings);
    const providers = [cfg.model, cfg.escalationModel].map((m) => (/^kie:/i.test(String(m)) ? "kie_chat" : "openrouter_chat"));
    if (providers.includes("openrouter_chat")) await budgetOnce();
    if (providers.every((p) => getBreaker(p, { now }).state().state === "open")) {
      throw new EditError("BREAKER_OPEN", { status: 503, errorClass: "provider", retryable: true, stage: STAGE, extra: { provider: "islands", skipped: true } });
    }
    const dur = chunk.end - chunk.start;
    let items = relIslands;
    if (!items) {
      items = [];
      for (let t = 0; t < dur - 0.05; t += cfg.maxIslandSec) items.push({ start: t, end: Math.min(dur, t + cfg.maxIslandSec) });
    }
    const res = await islandChat.transcribeIslands({
      islands: items.map((i) => ({ start: chunk.start + i.start, end: chunk.start + i.end })), pcm: getPcm(),
      settings, project, signal, tracker, onCost: islandsCost(chunk.index), onNotice, chat: chatImpl, cacheDir,
      languageHint: forced || state.detected, envelope: envOk ? envelope : null, floorDb, speechDb, purpose: "transcribe", now,
    });
    const words = [];
    const votes = new Map();
    for (const isl of res.islands) {
      for (const w of isl.words) {
        const word = { text: w.text, start: r3(w.start - chunk.start), end: r3(w.end - chunk.start), conf: w.conf };
        if (w.isFiller) word.isFiller = true;
        words.push(word);
      }
      if (isl.lang && isl.words.length) votes.set(isl.lang, (votes.get(isl.lang) || 0) + isl.words.length);
    }
    let language = null, best = 0;
    for (const [l, n] of votes) if (n > best) { best = n; language = l; }
    return { words, segments: [], language, costUsd: 0, costRecorded: true, model: res.models.join("+") || cfg.model, escalations: res.escalations };
  }

  async function doChunk(chunk) {
    const cpRel = `analysis/stt/chunk-${chunk.index}.json`;
    const cpAbs = abs(cpRel);
    const prior = fsx.readJsonSafe(cpAbs);
    const cp = prior.ok && isPlain(prior.value) ? prior.value : null;
    if (cp && cp.schemaVersion === CHUNK_SCHEMA_VERSION && Math.abs(Number(cp.start) - chunk.start) < 1e-3 && Math.abs(Number(cp.end) - chunk.end) < 1e-3
        && typeof cp.engine === "string" && Array.isArray(cp.words)) {
      if (cp.language && !state.detected) state.detected = cp.language;
      chunkRecords[chunk.index] = cp;
      return;
    }
    const chunkDur = chunk.end - chunk.start;
    const relIslands = clipIslands(islands, chunk);
    const speechSec = relIslands ? relIslands.reduce((a, i) => a + (i.end - i.start), 0) : null;
    const speechRatio = speechSec == null ? null : speechSec / Math.max(0.01, chunkDur);
    const attempts = [];
    let audioFile = null, encodeError = null;

    for (const eng of order) {
      if (signal && signal.aborted) throw cancelledError();
      capGuard();
      let gate = null;
      let model = null;
      if (eng.key !== "islands") {
        if (eng.needsAudioFile && encodeError) { attempts.push({ engine: eng.key, code: "AUDIO_ENCODE_FAILED", skipped: true }); continue; }
        if (eng.provider === openrouterStt.PROVIDER) await budgetOnce();
        model = eng.modelOf(settings);
        gate = engineGate(eng.provider, model, now);
        if (!gate.ok) { attempts.push({ engine: eng.key, code: gate.reason, skipped: true }); continue; }
      }
      try {
        let res;
        if (eng.key === "islands") {
          res = await runIslandsEngine(chunk, relIslands);
        } else {
          if (!audioFile) {
            try {
              audioFile = await chunker.encodeChunk({ projectDir, wavRel, chunk, signal, pidFile, lowPriority, runId });
            } catch (e) {
              if ((signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled")) { gate.release(); throw e; }
              encodeError = e;
              gate.release();
              attempts.push({ engine: eng.key, code: (e && e.code) || "AUDIO_ENCODE_FAILED", class: (e && e.errorClass) || "bug" });
              continue;
            }
          }
          res = await eng.run({
            chunk, chunkAudioAbs: audioFile.abs, chunkDur, settings, stt, project, signal, auth, kieAuth, fetchImpl, forced,
            detected: state.detected, speechRatio, projectDir, onProviderTask,
            timeoutMs: Math.min(180 * 1000, Math.max(45 * 1000, 30 * 1000 + chunkDur * 250)),
          });
        }
        if (!res.costRecorded) addCost(res.costUsd, { provider: eng.provider, engine: eng.key, model: res.model || model, chunk: chunk.index });
        if (!forced && res.language && !state.detected) state.detected = res.language;
        const words = (Array.isArray(res.words) ? res.words : []).slice().sort((a, b) => a.start - b.start);
        const v = validateTranscript(res.words, { chunkDur, islands: relIslands });
        if (!v.ok) {
          if (gate) gate.release();
          attempts.push({ engine: eng.key, code: `INVALID_${v.reason}`, class: "provider" });
          continue;
        }
        if (gate) gate.success();
        const record = {
          schemaVersion: CHUNK_SCHEMA_VERSION, index: chunk.index, start: chunk.start, end: chunk.end, engine: eng.key,
          model: res.model || model, language: forced || res.language || state.detected || null,
          timing: eng.key === "islands" ? "approx" : "word", fillersTrusted: eng.fillersTrusted, boundariesTrusted: eng.boundariesTrusted,
          words, segments: Array.isArray(res.segments) ? res.segments : [], costUsd: r8(Number(res.costUsd) || 0),
          taskId: res.taskId || null, attempts, validation: v.metrics, createdAt: now(),
        };
        fsx.ensureDir(path.dirname(cpAbs));
        fsx.writeJsonAtomic(cpAbs, record);
        chunkRecords[chunk.index] = record;
        if (attempts.some((a) => !a.skipped)) {
          state.fallbacks.push(`stt:c${chunk.index}:${attempts.filter((a) => !a.skipped).map((a) => a.engine).join(">")}>${eng.key}`.slice(0, 60));
        }
        if (eng.key === "islands") notice("TIMING_APPROX", "warn", "Word timing is approximate for part of this video.");
        return;
      } catch (e) {
        const err = isEditError(e) ? e : new EditError("STT_ENGINE_CRASHED", { errorClass: "bug", stage: STAGE, detail: e && e.message });
        if ((signal && signal.aborted) || err.errorClass === "cancelled") { if (gate) gate.release(); throw err; }
        if (err.code === "COST_CAP_REACHED") { if (gate) gate.release(); throw err; }
        if (eng.key !== "islands" && err.extra && Number(err.extra.costUsd) > 0) {
          addCost(err.extra.costUsd, { provider: eng.provider, engine: eng.key, model, chunk: chunk.index });
        }
        if (gate) gate.fail(err);
        attempts.push({ engine: eng.key, code: err.code, class: err.errorClass, ...(err.extra && err.extra.skipped ? { skipped: true } : {}) });
      }
    }
    throw new EditError("STT_FAILED", {
      status: 503, errorClass: "provider", retryable: true, stage: STAGE,
      userMessage: "Transcription services are unavailable right now; your upload is saved.",
      detail: attempts.map((a) => `${a.engine}:${a.code}`).join(" ").slice(0, 500),
      extra: { actions: [...ACTIONS], chunk: chunk.index, chunks: plan.length, attempts, costUsd: r8(state.costUsd) },
    });
  }

  // Chunk 0 first (its language informs the rest), then the remaining chunks in parallel.
  const failures = [];
  const runOne = async (chunk) => {
    try { await doChunk(chunk); }
    catch (e) { failures.push(e); }
    finally { state.done++; progress(Math.round((state.done / plan.length) * 90), "Transcribing"); }
  };
  const fatal = () => failures.find((e) => (isEditError(e) && (e.errorClass === "cancelled" || e.code === "COST_CAP_REACHED")) || !isEditError(e));
  progress(0, "Transcribing");
  await runOne(plan[0]);
  if (!fatal() && plan.length > 1) {
    let next = 1;
    const worker = async () => {
      while (next < plan.length && !fatal() && !(signal && signal.aborted)) await runOne(plan[next++]);
    };
    await Promise.all(Array.from({ length: Math.min(stt.concurrency, plan.length - 1) }, worker));
  }
  if (signal && signal.aborted) throw cancelledError();
  const stop = fatal();
  if (stop) throw stop;
  if (failures.length) throw failures[0];

  const records = chunkRecords.slice();
  const merged = merge.mergeChunks(records, { envelope: envOk ? envelope : null, floorDb, speechDb });
  let words = merged.words;
  const disfluencyInfo = { ran: false, regions: 0, inserted: 0, failed: false, error: null };
  const needsRecovery = records.some((r) => r.fillersTrusted === false);
  if (recoverFillers && envOk && Number.isFinite(floorDb) && words.length) {
    let capped = false;
    try { capGuard(); } catch { capped = true; }
    if (!capped) {
      const untrusted = new Set(records.filter((r) => r.boundariesTrusted === false).map((r) => r.index));
      const rec = await disfluency.recoverDisfluencies({
        words, envelope, floorDb, speechDb, durationSec: D, pcm: getPcm(), settings, project, signal, tracker,
        onCost: islandsCost(null), onNotice, chat: chatImpl, cacheDir, languageHint: forced || merged.language || state.detected,
        isUntrusted: (w) => untrusted.has(w.chunk), now,
      });
      words = rec.words;
      Object.assign(disfluencyInfo, { ran: true, regions: rec.regions.length, inserted: rec.inserted.length, failed: rec.failed, error: rec.error });
      if (rec.failed && (rec.regions.length || needsRecovery)) notice("FILLERS_LIMITED", "info", "Some filler words may not be detected.");
    } else if (needsRecovery) {
      notice("FILLERS_LIMITED", "info", "Some filler words may not be detected.");
    }
  } else if (needsRecovery) {
    notice("FILLERS_LIMITED", "info", "Some filler words may not be detected.");
  }
  if (merged.timing === "approx") notice("TIMING_APPROX", "warn", "Word timing is approximate for part of this video.");
  progress(100, "Transcribed");

  const finalWords = merge.finalizeWords(words);
  const language = forced || merged.language || state.detected || null;
  return {
    language,
    languageSource: forced ? "forced" : "detected",
    timing: merged.timing,
    engines: merged.engines,
    words: finalWords,
    chunks: records.map((r) => ({
      index: r.index, start: r.start, end: r.end, engine: r.engine, model: r.model, language: r.language, timing: r.timing,
      words: Array.isArray(r.words) ? r.words.length : 0, costUsd: r.costUsd || 0, attempts: Array.isArray(r.attempts) ? r.attempts : [],
    })),
    costUsd: r8(state.costUsd),
    notices: [...state.notices.values()],
    fallbacks: state.fallbacks.slice(0, 10),
    disfluency: disfluencyInfo,
    discoveries: { language, words: finalWords.length, wpm: Math.round(finalWords.length / Math.max(1 / 60, D / 60)) },
  };
}

function transcriptDoc(result) {
  return {
    schemaVersion: 1, language: result.language, languageSource: result.languageSource, timing: result.timing,
    engines: result.engines, words: result.words,
  };
}

module.exports = {
  transcribeProject, transcriptDoc, validateTranscript, engineOrder, sttSettings, loadEnvelope, envelopeFromFeatures, planFor, islandsFrom, effectiveCap,
  ENGINES, DEFAULT_ORDER, ORDER_GROUPS, VALIDATION, ACTIONS,
};
