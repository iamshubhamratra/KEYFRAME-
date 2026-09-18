// VIDEO EDIT DISFLUENCY RECOVERY — put back the "um"s the transcription engine left out.
//
// WHY THIS EXISTS. Filler removal is a headline feature, and it can only cut what the transcript
// contains. whisper-turbo drops most fillers and collapses repeats; deepgram drops um/uh and folds
// their time into the next word (1.2 s onset error, ANALYSIS.md §1). The audio still has them: a
// voiced stretch (loud, low zero-crossing, periodic) that no word covers. This pass finds those
// stretches, asks the island chat model what was said there (with ±200 ms of context so it hears the
// sound in place), and inserts only what is new — never a copy of the neighbouring word — spanning the
// region, conf 0.7, flagged `inserted`. For engines whose word boundaries are not trusted (deepgram)
// a long word that swallowed a pause is first trimmed to start after the pause, so the swallowed
// filler becomes an uncovered region too. Failure is never fatal: the caller notes FILLERS_LIMITED.
//
// CONTRACT:
//   findUncoveredVoiced(words, envelope, { floorDb, start=0, end=null, minSec=0.15, padSec=0.06, bridgeSec=0.03,
//                        zcrMax=0.15, pitchMin=0.4 }) -> [{ start, end }]
//   splitFoldedWords(words, envelope, { floorDb, isUntrusted=(w)=>true, pauseSec=0.12, minWordSec=0.6 }) -> words
//   recoverDisfluencies({ words, envelope, floorDb, speechDb, durationSec, wavAbs | pcm, settings, project, signal,
//                         tracker, onCost, onNotice, chat, cacheDir, languageHint, isUntrusted, maxRegions=40, contextSec=0.2,
//                         islandsImpl, now })
//     -> { words, inserted, regions, costUsd, failed, error }
//   isFillerText(text)

const { isEditError } = require("../../errors");
const islandChat = require("./island_chat");
const islandsLib = require("../islands");
const wordTiming = require("../word_timing");

const PURE_FILLER_RE = /^(?:u+m+|u+h+m*|e+r+m*|a+h+|h+m+|m+h*m+|eh+|em+|euh|heu|bah|äh+m*|ähm|hã|ahn|अं|उम्म|हम्म|えー|えーと|あのー|اممم|آه)$/iu;
const INSERT_CONF = 0.7;
const MAX_WORDS_PER_REGION = 4;

const r3 = (x) => Math.round(x * 1000) / 1000;
const normWord = (t) => String(t || "").normalize("NFKC").toLowerCase().replace(/[\p{P}]+/gu, "").trim();

function isFillerText(text) {
  return PURE_FILLER_RE.test(normWord(text));
}

function findUncoveredVoiced(words, envelope, opts = {}) {
  const { floorDb, start = 0, end = null, minSec = 0.15, padSec = 0.06, bridgeSec = 0.03, zcrMax = 0.15, pitchMin = 0.4 } = opts;
  const rms = envelope && envelope.rms;
  if (!rms || !rms.length || !Number.isFinite(floorDb)) return [];
  const hop = envelope.hop || 0.01;
  const n = rms.length;
  const covered = new Uint8Array(n);
  for (const w of words || []) {
    if (!w || !Number.isFinite(w.start) || !Number.isFinite(w.end)) continue;
    const a = Math.max(0, Math.floor((w.start - padSec) / hop)), b = Math.min(n - 1, Math.ceil((w.end + padSec) / hop));
    for (let i = a; i <= b; i++) covered[i] = 1;
  }
  const zcr = envelope.zcr && envelope.zcr.length === n ? envelope.zcr : null;
  const pitch = envelope.pitch && envelope.pitch.length === n ? envelope.pitch : null;
  const voiced = (i) => rms[i] > floorDb + 10 && (!zcr || zcr[i] < zcrMax) && (!pitch || pitch[i] > pitchMin);
  const i0 = Math.max(0, Math.floor(start / hop));
  const i1 = Math.min(n - 1, end == null ? n - 1 : Math.ceil(end / hop));
  const bridge = Math.max(0, Math.round(bridgeSec / hop));
  const regions = [];
  let runStart = -1, lastHit = -1;
  const flush = () => {
    if (runStart >= 0 && (lastHit - runStart + 1) * hop >= minSec - 1e-9) regions.push({ start: r3(runStart * hop), end: r3((lastHit + 1) * hop) });
    runStart = -1; lastHit = -1;
  };
  for (let i = i0; i <= i1; i++) {
    if (voiced(i) && !covered[i]) {
      if (runStart < 0) runStart = i;
      lastHit = i;
    } else if (runStart >= 0 && i - lastHit > bridge) {
      flush();
    }
  }
  flush();
  return regions;
}

function splitFoldedWords(words, envelope, { floorDb, isUntrusted = () => true, pauseSec = 0.12, minWordSec = 0.6 } = {}) {
  const rms = envelope && envelope.rms;
  if (!rms || !rms.length || !Number.isFinite(floorDb)) return (words || []).map((w) => ({ ...w }));
  const hop = envelope.hop || 0.01;
  const need = Math.max(1, Math.round(pauseSec / hop));
  return (words || []).map((w) => {
    const out = { ...w };
    if (!isUntrusted(w) || !(w.end - w.start >= minWordSec)) return out;
    const a = Math.max(0, Math.floor(w.start / hop)), b = Math.min(rms.length - 1, Math.floor((w.end - 0.1) / hop));
    let run = 0, lastPauseEnd = -1;
    for (let i = a; i <= b; i++) {
      if (rms[i] < floorDb + 6) { run++; if (run >= need) lastPauseEnd = i + 1; }
      else run = 0;
    }
    if (lastPauseEnd > 0 && lastPauseEnd * hop < w.end - 0.08) out.start = r3(lastPauseEnd * hop);
    return out;
  });
}

function spread(tokens, start, end, lang) {
  const weights = tokens.map((t) => wordTiming.wordWeight({ text: t.text, sp: t.sp, filler: t.isFiller }, lang || "en").weight);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0.04 * tokens.length, end - start);
  let cursor = start;
  return tokens.map((t, k) => {
    const len = (span * weights[k]) / total;
    const s = cursor, e = k === tokens.length - 1 ? start + span : cursor + len;
    cursor = e;
    return { ...t, start: r3(s), end: r3(e) };
  });
}

async function recoverDisfluencies(opts = {}) {
  const {
    words = [], envelope = null, floorDb = null, speechDb = null, durationSec = null, wavAbs = null, pcm = null, settings = null,
    project = null, signal = null, tracker = null, onCost = null, onNotice = null, chat = null, cacheDir = null,
    languageHint = null, isUntrusted = () => false, maxRegions = 40, contextSec = 0.2, islandsImpl = null, now = Date.now,
  } = opts;
  const rms = envelope && envelope.rms;
  if (!rms || !rms.length || !Number.isFinite(floorDb)) {
    return { words: words.map((w) => ({ ...w })), inserted: [], regions: [], costUsd: 0, failed: true, error: "NO_ENVELOPE" };
  }
  const base = splitFoldedWords(words, envelope, { floorDb, isUntrusted });
  const regions = findUncoveredVoiced(base, envelope, { floorDb }).slice(0, maxRegions);
  if (!regions.length) return { words: base, inserted: [], regions: [], costUsd: 0, failed: false, error: null };

  const D = Number.isFinite(durationSec) ? durationSec : rms.length * (envelope.hop || 0.01);
  const islands = islandsLib.islandsFromRegions(regions, { contextSec, durationSec: D }).map((isl) => ({
    ...isl, regions: regions.filter((r) => r.start < isl.end && r.end > isl.start),
  }));

  let res;
  try {
    const impl = islandsImpl || islandChat.transcribeIslands;
    res = await impl({
      islands: islands.map(({ start, end }) => ({ start, end })), wavAbs, pcm, settings, project, signal, tracker, onCost,
      onNotice, chat, cacheDir, languageHint, envelope, floorDb, speechDb, purpose: "disfluency", now,
    });
  } catch (e) {
    if ((signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled")) throw e;
    return {
      words: base, inserted: [], regions, costUsd: (e && e.extra && Number(e.extra.costUsd)) || 0, failed: true,
      error: (e && e.code) || "ISLANDS_FAILED",
    };
  }

  const sorted = base.slice().sort((a, b) => a.start - b.start);
  const inserted = [];
  islands.forEach((isl) => {
    const heard = (res.islands || []).filter((x) => x.start < isl.end && x.end > isl.start).flatMap((x) => x.words || []);
    for (const r of isl.regions) {
      const prev = [...sorted].reverse().find((w) => w.end <= r.start + 0.06) || null;
      const next = sorted.find((w) => w.start >= r.end - 0.06) || null;
      let cands = heard.map((w) => ({ text: String(w.text || "").trim(), sp: w.sp || null, isFiller: !!w.isFiller || isFillerText(w.text), mid: (w.start + w.end) / 2 }))
        .filter((w) => w.text);
      while (cands.length && prev && normWord(cands[0].text) === normWord(prev.text)) cands.shift();
      while (cands.length && next && normWord(cands[cands.length - 1].text) === normWord(next.text)) cands.pop();
      const inRegion = cands.filter((w) => w.mid >= r.start - 0.1 && w.mid <= r.end + 0.1);
      let chosen = inRegion.length ? inRegion : cands.filter((w) => w.isFiller);
      if (chosen.length > MAX_WORDS_PER_REGION) chosen = chosen.filter((w) => w.isFiller).slice(0, MAX_WORDS_PER_REGION);
      if (!chosen.length) continue;
      const chunk = (prev && Number.isInteger(prev.chunk)) ? prev.chunk : (next && Number.isInteger(next.chunk) ? next.chunk : 0);
      for (const w of spread(chosen, r.start, r.end, languageHint)) {
        inserted.push({ text: w.text, start: w.start, end: w.end, conf: INSERT_CONF, engine: "islands", chunk, isFiller: w.isFiller, inserted: true });
      }
    }
  });
  const merged = [...base, ...inserted].sort((a, b) => a.start - b.start || a.end - b.end);
  return { words: merged, inserted, regions, costUsd: Number(res.costUsd) || 0, failed: false, error: null };
}

module.exports = { findUncoveredVoiced, splitFoldedWords, recoverDisfluencies, isFillerText, INSERT_CONF };
