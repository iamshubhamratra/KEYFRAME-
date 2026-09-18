// VIDEO EDIT WORD TIMING — syllable-weighted island alignment and word-edge refinement (ANALYSIS.md §4.3–4.4).
//
// WHY THIS EXISTS. The island-chat fallback returns WORDS for an island but no times, and every cut,
// caption and QA check needs times. Spreading words evenly is wrong by whole words on real speech, so
// words get a syllable-weighted first guess over the island's voiced span, and each internal word
// boundary is then snapped to an energy dip with a monotone dynamic program:
//   cost(dip) = ((b − t)/σ)² − 0.15·depth − 1.0·[pause dip]     cost(no dip) = 1.5     σ = max(0.08, 0.35·T/K)
//   word duration ∈ [max(0.08, 0.05·syll), 1.2·syll]; a pause dip ≥ 150 ms must have a boundary within ±250 ms
// (encoded locally: consecutive boundaries may not straddle such a pause by more than 250 ms on each side).
// When the constraints are infeasible (an elongated "ummmm", more pauses than boundaries) the DP relaxes
// durations, then the pause rule, and never fails. Boundaries on a pause dip split it: the previous word
// ends where the pause starts and the next word starts where it ends. Confidence falls with the snap
// distance: conf = island.conf · (1 − min(1, |Δ|/3σ)) · (0.6 when no dip was found).
// Word-level engines (mai/whisper/deepgram) only need edge refinement, which reuses plan/timeline.js.
//
// CONTRACT (pure):
//   syllableCount(text, lang, { sp }) -> int ≥ 1          wordWeight(word, lang) -> number
//   findDips(env, t0, t1, { floorDb, speechDb, hop, pauseBelowSpeechDb=30 }) -> [{ t, start, end, depth, pause, dur }]
//   initialBoundaries(weights, vs, ve) -> number[K+1]
//   boundaryConf(delta, sigma, { hasDip=true, islandConf=1 }) -> 0..1
//   alignIsland({ words:[{w|text, sp?, filler?, cut?}], start, end, env, floorDb, speechDb, thresholdDb?, lang='en', conf=1, hop=0.01,
//                 pauseBelowSpeechDb=30, spanBelowSpeechDb=30 })      (null clamps = literal §4.4 levels; see PAUSE_BELOW_SPEECH_DB)
//       -> [{ ...word, text, start, end, conf, syll, snap:{ startDip, endDip } }]   snap ∈ 'edge' | 'pause' | 'dip' | 'none'
//   alignIslands(islands:[{start,end,words,conf?,lang?}], env, stats) -> flat word list
//   refineEdges(words, env, { floorDb, speechDb, approx=false, hop=0.01, minDurSec=0.04 }) -> words (new objects)
//   SYLLABLE_COUNTERS

const T = require("../plan/timeline");
const dsp = require("./dsp");

const SYLLABLE_COUNTERS = Object.freeze({
  en: require("./syllables/en"), es: require("./syllables/es"), fr: require("./syllables/fr"), de: require("./syllables/de"),
  pt: require("./syllables/pt"), hi: require("./syllables/hi"), ar: require("./syllables/ar"), ja: require("./syllables/ja"),
});

const PUNCT_AFTER = /[,.?!…،؟。？！、，।]+["')\]]*$/;
const NO_DIP_COST = 1.5;
const PAUSE_BONUS = 1.0;
const DEPTH_WEIGHT = 0.15;
const LONG_PAUSE_SEC = 0.15;
const PAUSE_REACH_SEC = 0.25;
const r3 = (x) => Math.round(x * 1000) / 1000;

function baseLang(lang) { return String(lang || "en").toLowerCase().split(/[-_]/)[0]; }

function syllableCount(text, lang, { sp } = {}) {
  const counter = SYLLABLE_COUNTERS[baseLang(lang)] || SYLLABLE_COUNTERS.en;
  return counter.count(text, { sp });
}

function wordText(w) { return String(w && (w.text != null ? w.text : w.w) || ""); }

function wordWeight(word, lang) {
  const syll = syllableCount(wordText(word), lang, { sp: word && word.sp });
  let wt = syll;
  if (word && (word.filler || word.isFiller)) wt *= 1.8;
  if (PUNCT_AFTER.test(wordText(word))) wt *= 1.3;
  if (word && word.cut) wt *= 0.6;
  return { syll, weight: wt };
}

// Level clamps relative to speech (deviation from the literal §4.4 "floor + 6 dB", measured on the probes): when the file floor is
// digital silence (noise-gated mics, TTS, AAC-encoded silence) P10 sits at −82…−100 dB, so breaths and gated gaps 40 dB below
// speech are neither "pause dips" nor outside the voiced span. Clamping both at speech − 30 dB moved first-word onset error on the
// en probe from 16 → 9 ms median (merged spans 219 → 12 ms) and on the es probe from 249 → 10 ms. On recordings whose SNR is
// below ~36 dB the clamp is inactive and the spec values apply unchanged. Pass null to get the literal spec behaviour.
const PAUSE_BELOW_SPEECH_DB = 30;
const SPAN_BELOW_SPEECH_DB = 30;

function pauseThreshold(floorDb, speechDb, belowSpeechDb = PAUSE_BELOW_SPEECH_DB) {
  const spec = floorDb + 6;
  return Number.isFinite(belowSpeechDb) && Number.isFinite(speechDb) ? Math.max(spec, speechDb - belowSpeechDb) : spec;
}

function findDips(env, t0, t1, { floorDb, speechDb, hop = 0.01, pauseBelowSpeechDb = PAUSE_BELOW_SPEECH_DB } = {}) {
  const n = env ? env.length : 0;
  if (!n) return [];
  const i0 = Math.max(1, Math.floor(t0 / hop)), i1 = Math.min(n - 2, Math.ceil(t1 / hop) - 1);
  if (i1 <= i0) return [];
  const sm = dsp.smooth(env, Math.max(1, Math.round(0.03 / hop)));     // 30 ms-smoothed RMS
  const pauseThr = pauseThreshold(floorDb, speechDb, pauseBelowSpeechDb);
  const reach = Math.max(1, Math.round(0.08 / hop));     // neighbouring maxima within ±80 ms
  const maxIn = (a, b) => { let m = -Infinity; for (let i = Math.max(0, a); i <= Math.min(n - 1, b); i++) m = Math.max(m, sm[i]); return m; };
  const dips = [];
  const inPause = new Uint8Array(n);
  for (let i = i0; i <= i1;) {
    if (sm[i] >= pauseThr) { i++; continue; }
    let j = i;
    while (j + 1 <= i1 && sm[j + 1] < pauseThr) j++;
    if ((j - i + 1) * hop >= 0.06 - 1e-9) {
      let mn = Infinity;
      for (let k = i; k <= j; k++) { mn = Math.min(mn, sm[k]); inPause[k] = 1; }
      const depth = Math.max(0, Math.min(maxIn(i - reach, i - 1), maxIn(j + 1, j + reach)) - mn);
      const start = i * hop, end = (j + 1) * hop;
      dips.push({ t: r3((start + end) / 2), start: r3(start), end: r3(end), depth: Math.round(depth * 10) / 10, pause: true, dur: r3(end - start) });
    }
    i = j + 1;
  }
  for (let i = i0; i <= i1; i++) {
    if (inPause[i] || !(sm[i] <= sm[i - 1] && sm[i] < sm[i + 1])) continue;
    const depth = Math.min(maxIn(i - reach, i - 1), maxIn(i + 1, i + reach)) - sm[i];
    if (depth < 4 || !(sm[i] < speechDb - 3)) continue;
    const t = (i + 0.5) * hop;
    dips.push({ t: r3(t), start: r3(t), end: r3(t), depth: Math.round(depth * 10) / 10, pause: false, dur: 0 });
  }
  dips.sort((a, b) => a.t - b.t);
  return dips.length > 400 ? dips.sort((a, b) => b.depth - a.depth).slice(0, 400).sort((a, b) => a.t - b.t) : dips;
}

function initialBoundaries(weights, vs, ve) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const out = [vs];
  let acc = 0;
  for (let k = 0; k < weights.length - 1; k++) { acc += weights[k]; out.push(vs + ((ve - vs) * acc) / total); }
  out.push(ve);
  return out;
}

function boundaryConf(delta, sigma, { hasDip = true, islandConf = 1 } = {}) {
  const c = islandConf * (1 - Math.min(1, Math.abs(delta) / (3 * sigma)));
  return Math.max(0, Math.min(1, hasDip ? c : c * 0.6));
}

function voicedSpan(env, start, end, thr, hop) {
  let a = -1, b = -1;
  for (let i = Math.max(0, Math.floor(start / hop)); i < Math.min(env.length, Math.ceil(end / hop)); i++) {
    if (env[i] > thr) { if (a < 0) a = i; b = i; }
  }
  if (a < 0) return [start, end];
  return [Math.max(start, a * hop), Math.min(end, (b + 1) * hop)];
}

function runDp(K, init, dips, sigma, durs, longPauses, { strictDur, pauseRule }) {
  const window = Math.max(4 * sigma, 0.5);
  const layers = [[{ pos: init[0], left: init[0], right: init[0], cost: 0, dip: null, prev: -1 }]];
  const straddles = (p, q) => pauseRule && longPauses.some((c) => c - PAUSE_REACH_SEC > p + 1e-9 && c + PAUSE_REACH_SEC < q - 1e-9);
  for (let k = 1; k <= K; k++) {
    const t = init[k];
    const cands = k === K
      ? [{ pos: init[K], left: init[K], right: init[K], local: 0, dip: null, sentinel: true }]
      : [
        { pos: t, left: t, right: t, local: NO_DIP_COST, dip: null },
        ...dips.filter((d) => Math.abs(d.t - t) <= window).map((d) => ({
          pos: d.t, left: d.pause ? d.start : d.t, right: d.pause ? d.end : d.t,
          local: ((d.t - t) / sigma) ** 2 - DEPTH_WEIGHT * d.depth - (d.pause ? PAUSE_BONUS : 0), dip: d,
        })),
      ];
    const prevLayer = layers[k - 1];
    const layer = [];
    const [minD, maxD] = durs[k - 1];
    for (const c of cands) {
      let best = null;
      prevLayer.forEach((p, pi) => {
        if (!Number.isFinite(p.cost)) return;
        const dur = c.left - p.right;
        if (!(c.pos > p.pos + 1e-6) || dur < (strictDur ? minD : 0.04) - 1e-9) return;
        if (strictDur && dur > maxD + 1e-9) return;
        if (straddles(p.pos, c.pos)) return;
        if (p.dip && c.dip && p.dip === c.dip) return;
        const cost = p.cost + c.local;
        if (!best || cost < best.cost - 1e-12) best = { cost, prev: pi };
      });
      if (best) layer.push({ ...c, cost: best.cost, prev: best.prev });
    }
    if (!layer.length) return null;
    layers.push(layer);
  }
  const path = [];
  let idx = 0;
  for (let k = K; k >= 0; k--) {
    const node = layers[k][idx];
    path.unshift(node);
    idx = node.prev;
  }
  return path;
}

function alignIsland({
  words, start, end, env, floorDb, speechDb, thresholdDb = null, lang = "en", conf = 1, hop = 0.01,
  pauseBelowSpeechDb = PAUSE_BELOW_SPEECH_DB, spanBelowSpeechDb = SPAN_BELOW_SPEECH_DB,
}) {
  const list = Array.isArray(words) ? words : [];
  const K = list.length;
  if (!K) return [];
  let thr = Number.isFinite(thresholdDb) ? thresholdDb : floorDb + Math.max(6, 0.35 * (speechDb - floorDb));
  if (Number.isFinite(spanBelowSpeechDb) && Number.isFinite(speechDb)) thr = Math.max(thr, speechDb - spanBelowSpeechDb);
  const [vs, ve] = env && env.length ? voicedSpan(env, start, end, thr, hop) : [start, end];
  const ws = list.map((w) => wordWeight(w, lang));
  const init = initialBoundaries(ws.map((x) => x.weight), vs, ve);
  const Tspan = Math.max(1e-3, ve - vs);
  const sigma = Math.max(0.08, (0.35 * Tspan) / K);
  const dips = K > 1 && env && env.length ? findDips(env, vs + 0.02, ve - 0.02, { floorDb, speechDb, hop, pauseBelowSpeechDb }) : [];
  const longPauses = dips.filter((d) => d.pause && d.dur >= LONG_PAUSE_SEC - 1e-9).map((d) => d.t);
  const durs = ws.map((x) => [Math.max(0.08, 0.05 * x.syll), 1.2 * x.syll]);
  const path = runDp(K, init, dips, sigma, durs, longPauses, { strictDur: true, pauseRule: true })
    || runDp(K, init, dips, sigma, durs, longPauses, { strictDur: false, pauseRule: true })
    || runDp(K, init, dips, sigma, durs, longPauses, { strictDur: false, pauseRule: false })
    || init.map((p) => ({ pos: p, left: p, right: p, dip: null }));
  const bconf = path.map((node, k) => (k === 0 || k === K ? Math.max(0, Math.min(1, conf)) : boundaryConf(node.pos - init[k], sigma, { hasDip: !!node.dip, islandConf: conf })));
  return list.map((w, k) => {
    const a = path[k], b = path[k + 1];
    let s = a.right, e = b.left;
    if (e <= s) e = s + 0.04;
    return {
      ...w, text: wordText(w), start: r3(s), end: r3(e), conf: Math.round(Math.min(bconf[k], bconf[k + 1]) * 1000) / 1000,
      syll: ws[k].syll, snap: { startDip: k === 0 ? "edge" : a.dip ? (a.dip.pause ? "pause" : "dip") : "none", endDip: k === K - 1 ? "edge" : b.dip ? (b.dip.pause ? "pause" : "dip") : "none" },
    };
  });
}

function alignIslands(islands, env, {
  floorDb, speechDb, thresholdDb = null, lang = "en", hop = 0.01, pauseBelowSpeechDb = PAUSE_BELOW_SPEECH_DB, spanBelowSpeechDb = SPAN_BELOW_SPEECH_DB,
} = {}) {
  const out = [];
  for (const isl of islands || []) {
    out.push(...alignIsland({
      words: isl.words, start: isl.start, end: isl.end, env, floorDb, speechDb, thresholdDb, lang: isl.lang || lang,
      conf: Number.isFinite(isl.conf) ? isl.conf : 1, hop, pauseBelowSpeechDb, spanBelowSpeechDb,
    }));
  }
  return out;
}

function refineEdges(words, env, { floorDb, speechDb, approx = false, hop = 0.01, minDurSec = 0.04 } = {}) {
  const refined = T.refineWordEdges(words, env, { floorDb, speechDb, approx, hop });
  for (let k = 0; k < refined.length; k++) {
    const w = refined[k];
    if (w.end - w.start >= minDurSec - 1e-9) continue;
    const nextStart = k + 1 < refined.length ? refined[k + 1].start : Infinity;
    const prevEnd = k > 0 ? refined[k - 1].end : 0;
    w.end = r3(Math.min(nextStart, w.start + minDurSec));
    if (w.end - w.start < minDurSec - 1e-9) w.start = r3(Math.max(prevEnd, w.end - minDurSec));
  }
  return refined;
}

module.exports = {
  syllableCount, wordWeight, findDips, initialBoundaries, boundaryConf, alignIsland, alignIslands, refineEdges, SYLLABLE_COUNTERS,
};
