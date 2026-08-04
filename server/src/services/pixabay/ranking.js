// Ranking. Produces a 0..100 score that is COMPARABLE ACROSS TYPES, so a mixed
// `searchAssets()` result can be sorted as one list.
//
// The weighting principle, taken from what actually goes wrong in a rendered film:
// RELEVANCE and FITNESS-FOR-FRAME dominate; popularity only breaks ties. A 40k-download
// stock photo of a handshake is still the wrong picture for "schema mapping", and the
// existing audio ranker (audio_sources.scoreTrack) learned the same lesson — length fit
// beats rating there for exactly this reason.
//
// Scores are deliberately NOT normalised against the candidate set: an absolute scale means
// a caller can apply a floor ("nothing under 40") and have it mean the same thing on every
// query, which a relative scale cannot support.

/** @typedef {import('./types').Asset} Asset */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const log10 = (n) => Math.log10(Math.max(1, Number(n) || 0));

/** How many of the query's words appear in the asset's tags. The single strongest signal. */
function relevance(asset, queryWords) {
  if (!queryWords.length) return 0.5;
  const tags = new Set(asset.tags);
  const title = String(asset.title || "").toLowerCase();
  let hit = 0;
  for (const w of queryWords) {
    if (tags.has(w) || [...tags].some((t) => t.includes(w) || w.includes(t)) || title.includes(w)) hit++;
  }
  return hit / queryWords.length;
}

/** Popularity, compressed. Downloads span six orders of magnitude; raw values would swamp
 *  every other term, which is how "most downloaded" becomes "most generic". */
function popularity(raw) {
  const dl = log10(raw.downloads);        // 0..~6
  const likes = log10(raw.likes);
  const views = log10(raw.views);
  return clamp((dl * 0.5 + likes * 0.3 + views * 0.2) / 5.5, 0, 1);
}

/** Frame fitness: does this asset fill the target frame without upscaling or heavy crop? */
function frameFit(asset, { orientation, minWidth }) {
  if (!asset.width || !asset.height) return 0.5;   // unknown ⇒ neutral, never punished
  const target = minWidth || 1080;
  const res = clamp(asset.width / target, 0, 1);   // ≥ target ⇒ full marks
  let shape = 0.6;
  const ratio = asset.width / asset.height;
  if (orientation === "vertical") shape = ratio <= 1 ? 1 : clamp(1.4 - ratio, 0, 1);
  else if (orientation === "horizontal") shape = ratio >= 1 ? 1 : clamp(ratio + 0.2, 0, 1);
  else shape = 1;
  return res * 0.55 + shape * 0.45;
}

/** @param {Asset} a @returns {number} 0..100 */
function scoreImage(a, ctx) {
  const s = relevance(a, ctx.words) * 46 + frameFit(a, ctx) * 34 + popularity(a.raw || {}) * 20;
  return Math.round(clamp(s, 0, 100));
}

function scoreVideo(a, ctx) {
  // Duration matters in a way it does not for stills: under ~3s cannot cover a scene, and a
  // 60s clip is a download cost for footage that will never be seen.
  const d = Number(a.duration) || 0;
  const durFit = d === 0 ? 0.5 : d < 3 ? 0.2 : d <= 30 ? 1 : clamp(1 - (d - 30) / 60, 0.3, 1);
  const s = relevance(a, ctx.words) * 40 + frameFit(a, ctx) * 30 + durFit * 18 + popularity(a.raw || {}) * 12;
  return Math.round(clamp(s, 0, 100));
}

function scoreMusic(a, ctx) {
  // Mirrors audio_sources.scoreTrack's finding: covering the film without a loop seam is
  // worth more than any popularity signal.
  const d = Number(a.duration) || 0;
  const film = Number(ctx.durationSec) || 0;
  let lenFit = 0.5;
  if (d && film) lenFit = d >= film ? 1 : clamp(d / film, 0, 1) * 0.7;
  else if (d) lenFit = d >= 30 ? 0.8 : 0.4;
  const s = relevance(a, ctx.words) * 34 + lenFit * 46 + popularity(a.raw || {}) * 20;
  return Math.round(clamp(s, 0, 100));
}

function scoreSfx(a, ctx) {
  // A cue is an event. Short is the point; anything past a few seconds is a bed.
  const d = Number(a.duration) || 0;
  const lenFit = d === 0 ? 0.6 : d <= 3 ? 1 : d <= 8 ? 0.7 : 0.25;
  const s = relevance(a, ctx.words) * 46 + lenFit * 40 + popularity(a.raw || {}) * 14;
  return Math.round(clamp(s, 0, 100));
}

const SCORERS = { image: scoreImage, video: scoreVideo, music: scoreMusic, sfx: scoreSfx };

/**
 * Score in place and return sorted best-first.
 * @param {Asset[]} assets
 * @param {{query?:string, orientation?:string, minWidth?:number, durationSec?:number}} [ctx]
 * @returns {Asset[]}
 */
function rank(assets, ctx = {}) {
  const words = String(ctx.query || "").toLowerCase().match(/[a-z][a-z'-]{1,}/g) || [];
  const c = { ...ctx, words };
  for (const a of assets || []) a.score = (SCORERS[a.type] || scoreImage)(a, c);
  return (assets || []).slice().sort((x, y) => y.score - x.score);
}

module.exports = { rank, scoreImage, scoreVideo, scoreMusic, scoreSfx, __test: { relevance, popularity, frameFit } };
