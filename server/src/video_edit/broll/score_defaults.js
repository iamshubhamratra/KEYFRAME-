// VIDEO EDIT B-ROLL SCORING DEFAULTS — every tunable of slots, prior, contact sheet, judge and score.
//
// WHY THIS EXISTS. The numbers in ANALYSIS.md §8 and EDIT_PLAN.md §6 (need ≥ .45, the HIGH item budget
// + 30 %, the prior and total weights, the acceptance thresholds) are product decisions that will be
// retuned from real edits. Keeping them in one frozen table means a retune is one diff, tests can read
// the same constants they assert against, and an operator can override a value without a code change.
// Retrieval has its own table (broll/defaults.js, owned by the search side); this one is scoring-only
// and lives under `scoring` in the same optional override block so the two can never collide.
//
// CONTRACT:
//   SCORING_DEFAULTS (deep-frozen)
//   resolveScoringSettings(settings) -> plain merged copy. Overrides: settings.videoEdit.broll.scoring or
//     settings.broll.scoring (type-checked, unknown keys ignored); judge model from
//     settings.providers.llm.stageModels.ve_broll_judge when set.

const MB = 1024 * 1024;

const SCORING_DEFAULTS = deepFreeze({
  slots: {
    needMin: 0.45,           // visualSupport.need below this never becomes a slot
    headroom: 1.3,           // slots = HIGH item budget for the output duration × 1.3 (intensity changes never refetch)
    maxQueries: 3,
    defaultImportance: 0.5,  // sentence outside every content segment
    keepGapSec: 0.2,         // pause kept between sentences when estimating output time (natural pace)
    heuristicFaceRatio: 0.3, // first-person + emotional token ratio that makes a sentence faceRequired (no content analysis)
    screenContentRatio: 0.5, // share of sampled frames with screen content that protects a sentence
  },
  // EDIT_PLAN.md §6 RHYTHM_DEFAULTS, high column: the most permissive intensity bounds the slot set.
  rhythmHigh: { itemsPer60: 7, hookGuardSec: 1.5, minItemSec: 1.2, maxItemSec: 5.0 },
  prior: {
    wLex: 0.55, wRank: 0.15, wTech: 0.30, rankDecay: 0.15,
    topK: 8,                 // candidates on the contact sheet / in the candidates file
    preThumbK: 12,           // candidates whose thumbnails are fetched (room for de-dup and low-information drops)
    lexQueryWeight: 0.7, lexSentenceWeight: 0.3,
    unknownLexical: 0.25,    // candidate with no text at all: unknown, not zero, never enough to accept without the judge
    bm25K1: 1.2, bm25B: 0.5,
    pexelsRankFloor: 0.45,   // prior-only lexical floor for a tagless Pexels hit ranked in the provider's top `pexelsRankFloorTop`
    pexelsRankFloorTop: 5,
  },
  technical: {
    maxUpscale: 1.5,         // export upscale limit (prefilter)
    maxCoverLoss: 0.6,       // 1 − min(a/b, b/a) limit per layout box (prefilter)
    durationSlackSec: 0.5,   // clip must be ≥ need + slack
    greyMinStdev: 5,         // thumbnail grayscale stdev below this = low information (util.LOW_INFO_STDEV)
    imageDurationFit: 0.9,   // a still can hold any duration but moves less than footage
    imageZoomHeadroom: 1.08, // Ken Burns zoom needs pixels beyond the box
    unknownResolution: 0.4,
    pipScale: 0.55,          // PIP box width as a share of the output's short edge (16:9 box)
  },
  dedupe: { withinSlotHamming: 8, crossSlotHamming: 10 },
  sheet: {
    // Landscape / square output: 2 columns of 320×160 cells. Portrait output: 4 columns of 160×320 cells, so a
    // 9:16 frame is drawn ~120×213 instead of ~90×160 (both sheets stay 640×640, the llm_guard limit).
    cellW: 320, cellH: 160, cols: 2, maxLongEdge: 640, quality: 5, fontFile: "DMSans-Bold.ttf", fontSize: 28,
    portrait: { cellW: 160, cellH: 320, cols: 4 },
    thumbMaxBytes: 2 * MB, thumbTimeoutMs: 15000, thumbConcurrency: 4,
    thumbMaxEdge: 4096, thumbMaxPixels: 16 * 1000 * 1000, // decompression-bomb guard (dims known before decode)
  },
  judge: {
    model: "google/gemini-3.5-flash-lite",
    escalationModel: "google/gemini-3.5-flash",
    maxSlotsPerCall: 3, concurrency: 1, promptVersion: 2, maxSentenceChars: 300,
    maxBatchBase64Bytes: 1400000,     // llm_guard rejects > 1.5e6 for the whole call; batches split below it
    estimatedCallUsd: 0.004,          // flash-lite call incl. one repair (ANALYSIS.md §9), for the remaining-budget check
    estimatedEscalationUsd: 0.036,    // escalation ≈ 10× (gemini-3.5-flash incl. one repair)
  },
  score: {
    weights: { sem: 0.40, vis: 0.12, res: 0.10, aspect: 0.10, comp: 0.08, brand: 0.05, dur: 0.10, div: 0.05 },
    // sem = semRel·rel/10 + semLiteral·literalMatch + semLex·lex (judge) · lex alone without the judge
    sem: { rel: 0.60, literal: 0.15, lex: 0.25 },
    issuePenalty: 0.15,
    // Per-issue penalty overrides. `text` costs nothing on a slot that asked for charts/documents (mediaPreference
    // 'either'); a face is often the subject ("doctor talking with patient").
    issuePenalties: { faces: 0.05, text: 0.15, textImageFriendly: 0 },
    neutralComposition: 0.6, neutralBrand: 0.5, brandColorScale: 300,
  },
  accept: {
    // ANALYSIS.md §8 (implemented by score.acceptance): judge → rel ≥ minRelevance && total ≥ .55 video /
    // .50 image, bestLayout 'none' unusable; no judge → lexicalOnly. strongRelevance and rejectIssues are
    // NOT read by score.js yet — retuning them changes nothing until acceptance implements them.
    minRelevance: 6, strongRelevance: 7, videoTotal: 0.55, imageTotal: 0.50,
    rejectIssues: ["offtopic", "watermark", "cliche"],
    lexicalOnly: { minLex: 0.5, minTech: 0.6 },
  },
});

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

function overlay(dst, src) {
  if (!isPlain(src)) return dst;
  for (const [k, def] of Object.entries(dst)) {
    if (!(k in src)) continue;
    const v = src[k];
    if (typeof def === "number") { if (typeof v === "number" && Number.isFinite(v) && v >= 0) dst[k] = v; }
    else if (typeof def === "string") { if (typeof v === "string" && v.trim()) dst[k] = v.trim(); }
    else if (typeof def === "boolean") { if (typeof v === "boolean") dst[k] = v; }
    else if (Array.isArray(def)) { if (Array.isArray(v) && v.every((x) => typeof x === "string")) dst[k] = [...v]; }
    else if (isPlain(def)) overlay(def, v);
  }
  return dst;
}

function resolveScoringSettings(settings) {
  const out = clone(SCORING_DEFAULTS);
  const s = isPlain(settings) ? settings : {};
  const block = (isPlain(s.videoEdit) && isPlain(s.videoEdit.broll) && s.videoEdit.broll) || (isPlain(s.broll) && s.broll) || null;
  if (block && isPlain(block.scoring)) overlay(out, block.scoring);
  const stageModel = isPlain(s.providers) && isPlain(s.providers.llm) && isPlain(s.providers.llm.stageModels)
    ? s.providers.llm.stageModels.ve_broll_judge : null;
  if (typeof stageModel === "string" && stageModel.trim()) out.judge.model = stageModel.trim();
  out.prior.topK = Math.max(1, Math.min(8, Math.floor(out.prior.topK) || 8));
  out.prior.preThumbK = Math.max(out.prior.topK, Math.min(24, Math.floor(out.prior.preThumbK) || 12));
  out.judge.maxSlotsPerCall = Math.max(1, Math.min(3, Math.floor(out.judge.maxSlotsPerCall) || 3));
  out.judge.concurrency = Math.max(1, Math.min(4, Math.floor(out.judge.concurrency) || 1));
  const tooBig = (g) => Math.max(g.cellW * g.cols, g.cellH * Math.ceil(8 / Math.max(1, g.cols))) > 640;
  if (tooBig(out.sheet) || tooBig(out.sheet.portrait)) {
    out.sheet = clone(SCORING_DEFAULTS.sheet); // a sheet larger than the llm_guard limit can never be sent
  }
  out.judge.maxBatchBase64Bytes = Math.max(1, Math.min(1400000, Math.floor(out.judge.maxBatchBase64Bytes) || 1400000));
  return out;
}

// Contact-sheet grid for an output aspect ('9:16' → portrait cells).
function sheetGeometry(sheet, aspect) {
  const s = isPlain(sheet) ? sheet : SCORING_DEFAULTS.sheet;
  const portrait = typeof aspect === "string" && /^(\d+):(\d+)$/.test(aspect) && Number(aspect.split(":")[0]) < Number(aspect.split(":")[1]);
  const g = portrait && isPlain(s.portrait) ? s.portrait : s;
  return { cellW: g.cellW, cellH: g.cellH, cols: g.cols, orientation: portrait ? "portrait" : "landscape" };
}

module.exports = { SCORING_DEFAULTS, resolveScoringSettings, sheetGeometry };
