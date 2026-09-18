// VIDEO EDIT SPEECH-ISLAND CHAT — transcription of short audio islands by an audio-capable chat model.
//
// WHY THIS EXISTS. It is the last STT fallback (every transcription endpoint down) and the tool that
// recovers fillers the transcription models drop (ANALYSIS.md §4.4). Chat models are verbatim when
// told to be, but they are not transcription APIs, and the live probe found the ways they go wrong:
// numeric island ids were rewritten ("i1" → "i100:00") under low reasoning effort, so ids are LETTERS
// and both the id set and the count are schema-validated (the repair re-ask in ai/llm.js carries the
// exact complaint); KIE's `kie:` chat route silently drops `input_audio` parts and only hears audio sent
// as an `image_url` data URI; chat() may silently substitute a text-only fallback model, which would
// hallucinate a transcript — so a substituted model is a failure, and a failed or implausible batch
// escalates once to `islands.escalationModel`. Chat models return no timestamps: words are placed by
// analysis/word_timing.alignIsland (syllable weights + monotone dip-snapping DP), timing `approx`.
// Clip extraction, letter ids and batching are analysis/islands.js (sample-exact, in memory).
//
// CONTRACT:
//   transcribeIslands({ islands:[{start,end}], wavAbs | pcm:{samples,sampleRate}, settings, project, signal, tracker, onCost,
//                       onNotice, chat, cacheDir, languageHint, envelope:{rms,hop}?, floorDb?, speechDb?, purpose='transcribe', now })
//     -> { islands:[{ start, end, speech, lang, conf, model, words:[{ text, start, end, conf, isFiller, cut, sp }] }],
//          costUsd, models:[used], escalations, calls }
//   Throws EditError ISLANDS_FAILED (provider, retryable; extra.cause/causeClass/costUsd) when a batch fails on every
//   model, or the fault-injected error for `islands:error`. `islands:invalid_json` corrupts the primary model's replies
//   (the real repair + escalation run); `islands:approx_drift:<ms>` shifts aligned word times.
//   buildIslandSchema(ids) · audioPart(model, b64, cfg) · islandSettings(settings) · evaluateIsland(item, raw, env) ·
//   repeatedNgram(norms) · letterId (re-export of analysis/islands) · SYSTEM_PROMPT · STAGE · PROMPT_VERSION · DEFAULTS

const { z } = require("zod");
const { EditError, isEditError } = require("../../errors");
const faults = require("../../faults");
const { callJson } = require("../../ai/llm");
const { normalizeLanguage, fillerToken } = require("../../ai/openrouter_stt");
const { getBreaker, nextUtcMidnight } = require("../../providers/breaker");
const dsp = require("../dsp");
const islandsLib = require("../islands");
const wordTiming = require("../word_timing");
const { deepestDip } = require("./chunker");

const STAGE = "ve_stt_islands";
const PROMPT_VERSION = "ve-islands-1";
const PARALLEL_BATCHES = 2;
const DEFAULTS = Object.freeze({
  model: "meta/muse-spark-1.3-contributor", escalationModel: "google/gemini-3.5-flash", kieAudioPart: "image_url",
  maxIslandSec: 8, batchMaxSec: 30, batchMaxIslands: 10,
});
const SYLL_RATE = Object.freeze({ min: 1.5, max: 9 });
const MAX_BATCH_AUDIO_SEC = 34;
const DEFAULT_CONF = 0.8;
const REPEAT_CONF = 0.2;

const SYSTEM_PROMPT = [
  "You transcribe short speech islands cut from one recording. Each island is announced by a text line `ISLAND <ID> (<seconds>s)` immediately followed by its audio.",
  "Transcribe VERBATIM what is spoken in each island:",
  "- keep every filler (um, uh, er, erm, hmm and the equivalent hesitation sounds of the spoken language) and mark it \"filler\": true;",
  "- keep repetitions (\"the, the\"), false starts and restarts exactly as spoken;",
  "- a word cut off part-way ends with \"-\" and is marked \"cut\": true;",
  "- never paraphrase, correct, translate, summarize or complete a sentence; never invent words;",
  "- silence, music, breathing or noise produce no words and \"speech\": false;",
  "- attach punctuation to the preceding word (\"field.\"), never as a separate word;",
  "- write numbers as digits in \"w\" and as spoken in \"sp\" (w \"12\", sp \"twelve\").",
  "Return ONLY this JSON object: {\"islands\":[{\"id\":\"<ID>\",\"speech\":true,\"lang\":\"<ISO 639-1 code>\",\"words\":[{\"w\":\"...\",\"sp\":\"...\",\"cut\":false,\"filler\":false}],\"conf\":0.9}]}",
  "Use exactly the island IDs given (capital letters such as A, B, AA): one entry per island, in the order given. Never rename, renumber, merge or add islands.",
].join("\n");

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const numOr = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const normWord = (t) => String(t || "").normalize("NFKC").toLowerCase().replace(/[\p{P}]+/gu, "").trim();

function islandSettings(settings) {
  const p = (settings && settings.providers) || {};
  const isl = isPlain(p.islands) ? p.islands : {};
  const stt = isPlain(p.stt) ? p.stt : {};
  return {
    model: isl.model || stt.islandsModel || DEFAULTS.model,
    escalationModel: isl.escalationModel || DEFAULTS.escalationModel,
    kieAudioPart: isl.kieAudioPart === "input_audio" ? "input_audio" : "image_url",
    maxIslandSec: numOr(isl.maxIslandSec, DEFAULTS.maxIslandSec),
    // ai/llm_guard caps a call at 1.5 MB of base64 ≈ 35 s of 16 kHz mono WAV: stay under it whatever config says.
    batchMaxSec: Math.min(MAX_BATCH_AUDIO_SEC, numOr(isl.batchMaxSec, DEFAULTS.batchMaxSec)),
    batchMaxIslands: Math.max(1, Math.floor(numOr(isl.batchMaxIslands, DEFAULTS.batchMaxIslands))),
  };
}

function buildIslandSchema(ids) {
  const allowed = new Set(ids);
  const Word = z.object({
    w: z.string().max(120),
    sp: z.string().max(120).nullable().optional(),
    cut: z.boolean().nullable().optional(),
    filler: z.boolean().nullable().optional(),
  });
  const Island = z.object({
    id: z.string().max(16),
    speech: z.boolean().nullable().optional(),
    lang: z.string().max(16).nullable().optional(),
    words: z.array(Word).max(800),
    conf: z.number().min(0).max(1).nullable().optional(),
  });
  return z.object({ islands: z.array(Island).max(Math.max(1, ids.length * 2)) }).superRefine((v, ctx) => {
    const seen = new Set();
    v.islands.forEach((isl, k) => {
      if (!allowed.has(isl.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["islands", k, "id"], message: `unknown island id "${String(isl.id).slice(0, 16)}"; the only valid ids are ${ids.join(", ")}` });
      } else if (seen.has(isl.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["islands", k, "id"], message: `island id ${isl.id} appears twice` });
      }
      seen.add(isl.id);
    });
    const missing = ids.filter((id) => !seen.has(id));
    if (missing.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["islands"], message: `missing island ids ${missing.join(", ")}; return exactly ${ids.length} entries with ids ${ids.join(", ")}` });
    }
  });
}

function audioPart(model, b64, cfg = DEFAULTS) {
  if (/^kie:/i.test(String(model)) && cfg.kieAudioPart !== "input_audio") {
    return { type: "image_url", image_url: { url: `data:audio/wav;base64,${b64}` } };
  }
  return { type: "input_audio", input_audio: { data: b64, format: "wav" } };
}

// Islands longer than maxIslandSec are split at the deepest smoothed dip inside their middle 60 %.
function splitLong(items, maxSec, envelope) {
  const out = [];
  items.forEach((src, group) => {
    const stack = [{ start: src.start, end: src.end }];
    const pieces = [];
    while (stack.length) {
      const it = stack.shift();
      const d = it.end - it.start;
      if (d <= maxSec + 1e-9) { pieces.push(it); continue; }
      let cut = deepestDip(envelope, it.start + 0.2 * d, it.end - 0.2 * d, []);
      if (!Number.isFinite(cut)) cut = (it.start + it.end) / 2;
      stack.unshift({ start: it.start, end: cut }, { start: cut, end: it.end });
    }
    pieces.sort((a, b) => a.start - b.start).forEach((p) => out.push({ start: r3(p.start), end: r3(p.end), splitGroup: group }));
  });
  return out;
}

function voicedStats(env, floorDb, start, end) {
  if (!env || !env.rms || !env.rms.length || !Number.isFinite(floorDb)) return null;
  const hop = env.hop || 0.01;
  const i0 = Math.max(0, Math.floor(start / hop)), i1 = Math.min(env.rms.length - 1, Math.ceil(end / hop) - 1);
  let voiced = 0;
  for (let i = i0; i <= i1; i++) if (env.rms[i] > floorDb + 10) voiced++;
  return { voicedSec: voiced * hop, ratio: voiced / Math.max(1, i1 - i0 + 1) };
}

function repeatedNgram(norms) {
  for (const n of [2, 3, 4]) {
    const counts = new Map();
    for (let i = 0; i + n <= norms.length; i++) {
      const key = norms.slice(i, i + n).join(" ");
      const c = (counts.get(key) || 0) + 1;
      if (c > 3) return true;
      counts.set(key, c);
    }
  }
  let run = 1;
  for (let i = 1; i < norms.length; i++) { run = norms[i] && norms[i] === norms[i - 1] ? run + 1 : 1; if (run > 3) return true; }
  return false;
}

function evaluateIsland(item, raw, env) {
  const speechFlag = raw ? raw.speech !== false : false;
  const words = speechFlag && raw && Array.isArray(raw.words)
    ? raw.words.map((w) => {
      const text = String(w.w || "").replace(/\s+/g, " ").trim();
      return { w: text, sp: w.sp ? String(w.sp).trim() : null, cut: w.cut === true || /-$/.test(text), filler: w.filler === true || fillerToken(text) };
    }).filter((w) => w.w)
    : [];
  const stats = voicedStats(env.envelope, env.floorDb, item.start, item.end);
  const voicedSec = stats ? stats.voicedSec : Math.max(0.01, item.end - item.start);
  const lang = normalizeLanguage(raw && raw.lang) || env.languageHint || null;
  const syll = words.reduce((a, w) => a + wordTiming.syllableCount(w.w, lang || "en", { sp: w.sp }), 0);
  const rate = voicedSec >= 0.5 && words.length >= 2 ? syll / voicedSec : null;
  let conf = raw && Number.isFinite(raw.conf) ? clamp(raw.conf, 0, 1) : DEFAULT_CONF;
  if (repeatedNgram(words.map((w) => normWord(w.w)))) conf = Math.min(conf, REPEAT_CONF);
  return {
    words, lang, conf, rate,
    rateSuspect: rate != null && (rate < SYLL_RATE.min || rate > SYLL_RATE.max),
    emptyButVoiced: !words.length && (stats ? stats.ratio > 0.5 : false),
  };
}

function modelGate(model, now) {
  const provider = /^kie:/i.test(String(model)) ? "kie_chat" : "openrouter_chat";
  const P = getBreaker(provider, { now });
  const M = getBreaker(`${provider}:${model}`, { now });
  if (P.state().state === "open" || M.state().state === "open") return null;
  if (!P.canRequest()) return null;
  if (!M.canRequest()) { P.recordFailure("cancelled"); return null; }
  const release = () => { P.recordFailure("cancelled"); M.recordFailure("cancelled"); };
  return {
    success() { P.recordSuccess(); M.recordSuccess(); },
    release,
    fail(err) {
      // Bad JSON or a substituted model means the model ANSWERED — not a health signal for the breaker.
      if (!(isEditError(err) && err.code === "LLM_CALL_FAILED")) { release(); return; }
      if (err.errorClass === "budget") { P.recordFailure("budget", { untilMs: nextUtcMidnight(now()) }); M.recordFailure("cancelled"); return; }
      M.recordFailure(err.errorClass);
      P.recordFailure("cancelled");
    },
  };
}

function islandsError(code, { detail = null, extra = {} } = {}) {
  return new EditError(code, {
    status: 503, errorClass: "provider", retryable: true, detail, stage: "TRANSCRIBING",
    userMessage: "The speech fallback could not transcribe this audio.", extra: { provider: "islands", ...extra },
  });
}

const isCancel = (e, signal) => (signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled");

async function transcribeIslands(opts = {}) {
  const {
    islands = [], wavAbs = null, pcm: pcmIn = null, settings = null, project = null, signal = null, tracker = null, onCost = null,
    onNotice = null, chat = null, cacheDir = null, languageHint = null, envelope = null, floorDb = null, speechDb = null,
    purpose = "transcribe", now = Date.now,
  } = opts;
  const faultCtx = { settings, project, signal };
  await faults.maybeFail("islands", faultCtx);
  const fault = faults.faultFor("islands", faultCtx);
  const cfg = islandSettings(settings);
  if (!islands.length) return { islands: [], costUsd: 0, models: [], escalations: 0, calls: 0 };
  if (!pcmIn && !wavAbs) throw new EditError("STT_BAD_REQUEST", { errorClass: "bug", detail: "pcm or wavAbs required" });

  const pcm = pcmIn || dsp.readWav(wavAbs);
  const durationSec = pcm.samples.length / pcm.sampleRate;
  const items = splitLong(
    islands.filter((i) => i && i.end - i.start >= 0.05).map((i) => ({ start: Math.max(0, i.start), end: Math.min(durationSec, i.end) })),
    cfg.maxIslandSec, envelope,
  ).filter((i) => i.end - i.start >= 0.05);
  const env = { envelope, floorDb, languageHint: normalizeLanguage(languageHint), costUsd: 0, calls: 0, escalations: 0, models: new Set() };
  const costHook = (entry) => {
    env.calls++;
    env.costUsd += Number(entry && entry.costUsd) || 0;
    if (typeof onCost === "function") onCost({ ...entry, purpose });
  };
  const baseChat = typeof chat === "function" ? chat : null;
  const chatFor = (model) => {
    if (!(fault && fault.mode === "invalid_json" && model === cfg.model)) return baseChat;
    const real = baseChat || ((o) => require("../../../services/openrouter").chat(o));
    return async (o) => ({ ...(await real(o)), text: "{\"islands\":[{\"id\":\"i100:00\",\"speech\":true,\"words\":[],\"conf\":0.5}]}" });
  };

  async function callBatch(batch, model) {
    const ids = batch.map((_, k) => islandsLib.letterId(k));
    const clips = islandsLib.extractIslands(pcm, batch, { durationSec });
    const user = [];
    if (env.languageHint) user.push({ type: "text", text: `Expected language: ${env.languageHint} (transcribe what is actually spoken).` });
    clips.forEach((clip, k) => {
      user.push({ type: "text", text: `ISLAND ${ids[k]} (${clip.durationSec.toFixed(2)}s)` });
      user.push(audioPart(model, islandsLib.toBase64Wav(clip.wav), cfg));
    });
    const res = await callJson({
      stage: STAGE, system: SYSTEM_PROMPT, user, schema: buildIslandSchema(ids), model, temperature: 0, tracker, signal,
      promptVersion: PROMPT_VERSION, cacheDir, chat: chatFor(model), onNotice, onCost: costHook,
    });
    if (res.modelFallback) {
      throw islandsError("ISLANDS_MODEL_FALLBACK", { detail: "chat substituted another model", extra: { requested: model, used: res.model } });
    }
    const byId = new Map(res.value.islands.map((x) => [x.id, x]));
    return { model: res.model || model, raws: ids.map((id) => byId.get(id) || null) };
  }

  async function runBatch(batch) {
    const models = [cfg.model, cfg.escalationModel].filter((m, i, a) => m && a.indexOf(m) === i);
    let lastErr = null;
    for (let attempt = 0; attempt < models.length; attempt++) {
      const model = models[attempt];
      if (attempt > 0) env.escalations++;
      const gate = modelGate(model, now);
      if (!gate) { lastErr = lastErr || islandsError("ISLANDS_BREAKER_OPEN", { extra: { model } }); continue; }
      let evals, used;
      try {
        const r = await callBatch(batch, model);
        used = r.model;
        evals = batch.map((it, k) => evaluateIsland(it, r.raws[k], env));
      } catch (e) {
        if (isCancel(e, signal)) { gate.release(); throw e; }
        gate.fail(e);
        lastErr = e;
        continue;
      }
      const suspects = evals.filter((ev) => ev.rateSuspect).length;
      if (attempt < models.length - 1 && suspects > batch.length / 3) {
        gate.release();
        lastErr = islandsError("ISLANDS_IMPLAUSIBLE", { detail: `${suspects}/${batch.length} islands outside ${SYLL_RATE.min}-${SYLL_RATE.max} syllables/s`, extra: { model } });
        continue;
      }
      gate.success();
      env.models.add(used);
      for (let k = 0; k < batch.length; k++) {
        if (!evals[k].emptyButVoiced) continue;
        try {
          const single = await callBatch([batch[k]], model);
          evals[k] = evaluateIsland(batch[k], single.raws[0], env);
        } catch (e) {
          if (isCancel(e, signal)) throw e;   // keep the empty result: one retry only
        }
      }
      return { model: used, evals };
    }
    throw islandsError("ISLANDS_FAILED", {
      detail: lastErr ? `${lastErr.code || "ERROR"}${lastErr.detail ? `: ${String(lastErr.detail).slice(0, 160)}` : ""}` : "no model available",
      extra: { cause: lastErr && lastErr.code ? lastErr.code : null, causeClass: lastErr && lastErr.errorClass ? lastErr.errorClass : null },
    });
  }

  const batches = islandsLib.batchIslands(items, cfg);
  const results = new Array(batches.length);
  let next = 0, failure = null;
  const worker = async () => {
    while (next < batches.length && !failure) {
      const b = next++;
      try { results[b] = await runBatch(batches[b]); }
      catch (e) { failure = failure || e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, worker));
  if (failure) {
    if (isEditError(failure) && failure.extra) failure.extra.costUsd = Math.round(env.costUsd * 1e8) / 1e8;
    throw failure;
  }

  const drift = fault && fault.mode === "approx_drift" ? (Number(fault.arg) || 0) / 1000 : 0;
  const out = [];
  batches.forEach((batch, b) => {
    batch.forEach((it, k) => {
      const ev = results[b].evals[k];
      const aligned = wordTiming.alignIsland({
        words: ev.words, start: it.start, end: it.end, env: envelope && envelope.rms ? envelope.rms : null, floorDb, speechDb,
        lang: ev.lang || "en", conf: ev.conf, hop: (envelope && envelope.hop) || 0.01,
      });
      const words = aligned.map((a) => ({
        text: a.text, sp: a.sp || null, isFiller: !!a.filler, cut: !!a.cut, conf: a.conf,
        start: r3(clamp(a.start + drift, it.start, it.end)), end: r3(clamp(a.end + drift, it.start, it.end)),
      }));
      out.push({ start: it.start, end: it.end, speech: words.length > 0, lang: ev.lang, conf: ev.conf, model: results[b].model, words, splitGroup: it.splitGroup });
    });
  });
  // Split-island seam: the same word heard at the end of one piece and the start of the next is one word.
  for (let k = 1; k < out.length; k++) {
    const a = out[k - 1], b = out[k];
    if (a.splitGroup !== b.splitGroup || b.start - a.end > 0.08 || !a.words.length || !b.words.length) continue;
    if (normWord(a.words[a.words.length - 1].text) === normWord(b.words[0].text)) b.words.shift();
  }
  return {
    islands: out.map(({ splitGroup, ...rest }) => rest),
    costUsd: Math.round(env.costUsd * 1e8) / 1e8, models: [...env.models], escalations: env.escalations, calls: env.calls,
  };
}

module.exports = {
  transcribeIslands, buildIslandSchema, audioPart, islandSettings, evaluateIsland, repeatedNgram,
  letterId: islandsLib.letterId, SYSTEM_PROMPT, STAGE, PROMPT_VERSION, DEFAULTS,
};
