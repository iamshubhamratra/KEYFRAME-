// VIDEO EDIT B-ROLL SCORE — final totals, acceptance, cross-slot diversity and the scoring outputs.
//
// WHY THIS EXISTS. SCORING_ASSETS turns each slot's raw provider hits into the two files the rest of the
// edit trusts: `broll/candidates/<slotId>.json` (≤ 8 schema-valid AssetRefs with every score, the judge
// verdict, licence/attribution, thumbnail path and the renditions needed to materialize later) and
// `analysis/broll_scored.json` (per slot: accepted?, best, top — what BUILDING_EDIT_PLAN attaches to
// BrollItems). The rules are the product contract (ANALYSIS.md §8):
//   total = .40·sem + .12·vis + .10·res + .10·aspect + .08·comp + .05·brand + .10·durFit + .05·div − .15·|issues|
//     sem = .75·rel/10 + .25·lex (lex alone without the judge) · vis = .5·quality/10 + .5·tech (tech alone)
//     div = 1 − max tag-Jaccard vs assets already chosen for earlier slots · `unsafe` excludes outright
//   accept (judge) : rel ≥ 6 && total ≥ .55 video / ≥ .50 image (bestLayout 'none' = unusable)
//   accept (no judge): lex ≥ .5 && tech ≥ .6, flagged judge:'unavailable' — and NEVER at low intensity, where
//     a cutaway nobody looked at is not worth the risk. Acceptance is recorded for all three intensities so
//     an intensity change never re-scores.
//   diversity: slots are resolved in rank order; a slot never takes an asset, or a near-duplicate picture
//     (dHash ≤ 10), already chosen by another slot, and avoids a provider author already used when any
//     other accepted candidate exists. Video first, then images when allowed and no video passes.
// The pipeline per slot is: prior (no stats) → top 12 thumbnails → one dHash/stdev/colour ffmpeg pass →
// prior again (grey stdev) → within-slot dHash de-dup (≤ 8) → top 8 → seeded letters → contact sheet;
// then all sheets are judged (≤ 3 per call) and slots are selected in rank order.
//
// CONTRACT:
//   computeTotal({ lexical, technical, judge, brand, diversity, cfg }) -> { sem, vis, comp, brand, diversity, total, excluded }
//   acceptance({ type, judge, total, lexical, tech, excluded, cfg }) -> { accepted, rule:'judge'|'lexical_only'|null, reason, byIntensity }
//   brandFit(color, palette, scale) -> 0..1|null · tagTokens(candidate, lang) -> Set · jaccard(a, b) · authorKey(candidate)
//   scoreEntries({ entries, judgeSlot, chosen, palette, lang, cfg }) -> scored entries (total desc)
//   selectBest(scored, { chosen, mediaPreference, allowImages, crossSlotHamming }) -> { best|null, blocked:Map<key, reason> }
//   toAssetRef(entry, slot) -> AssetRef (plan/schema AssetRefSchema-valid)
//   scoreSlots({ slots, candidatesBySlot, projectDir, output:{width,height,aspect}, projectSettings, lang, fetch, callJson,
//                signal, tracker, settings, fontDir, writeJson, cacheDir, now, onProgress, log, breaker, faults, pidFile, workDir })
//     -> { summary, files:{ scored, candidates:{ [slotId]: rel } }, costUsd, judge, notices, discoveries:{ brollMoments } }
//   SCORED_REL · candidatesRel(slotId) · THUMBS_REL · SHEETS_REL

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const fsx = require("../fsx");
const { EditError, isEditError } = require("../errors");
const { colorDistance, hammingHex } = require("../../services/asset_sources/util");
const { resolveScoringSettings } = require("./score_defaults");
const { rankPrior } = require("./prior");
const { sourceDims } = require("./technical");
const { analyzeText } = require("./lexical");
const { hashImages, dedupeByHash } = require("./dhash");
const { downloadThumb, frameUrls, representativeIndex, buildContactSheet, mapLimit, DEFAULT_FONT_DIR } = require("./contact_sheet");
const { judgeSlots, assignLetters } = require("./judge");
const { isPlain, num, clamp, clamp01, round, safeSlotId, throwIfAborted, cancelledError } = require("./common");

const SCORED_REL = "analysis/broll_scored.json";
const THUMBS_REL = "broll/thumbs";
const SHEETS_REL = "broll/sheets";
const candidatesRel = (slotId) => `broll/candidates/${slotId}.json`;
const INTENSITIES = Object.freeze(["low", "medium", "high"]);
const noopLog = { info() {}, warn() {}, error() {} };

const relOf = (projectDir, abs) => path.relative(projectDir, abs).split(path.sep).join("/");
const isCancel = (e, signal) => (signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled");

function brandFit(color, palette, scale = 300) {
  const pal = (Array.isArray(palette) ? palette : []).filter((p) => /^#[0-9a-f]{6}$/i.test(String(p)));
  if (!pal.length || !/^#[0-9a-f]{6}$/i.test(String(color || ""))) return null;
  const d = Math.min(...pal.map((p) => colorDistance(color, p)));
  return round(clamp01(1 - d / scale));
}

function tagTokens(c, lang = "en") {
  const text = c && Array.isArray(c.tags) && c.tags.length ? c.tags.join(" , ") : [c && c.title, c && c.text].filter(Boolean).join(" ");
  return new Set(analyzeText(text, lang).map((t) => t.keys[t.keys.length - 1]));
}

function jaccard(a, b) {
  if (!a || !b || !a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function authorKey(c) {
  const a = c && c.author;
  if (!a) return null;
  const id = a.url || a.name;
  return id ? `${c.provider}:${String(id).toLowerCase()}` : null;
}

function computeTotal({ lexical, technical, judge = null, brand = null, diversity = 1, cfg }) {
  const c = cfg || resolveScoringSettings(null);
  const lex = lexical == null ? 0 : clamp01(lexical);
  const tech = clamp01(technical.tech);
  const sem = judge ? 0.75 * (judge.relevance / 10) + 0.25 * lex : lex;
  const vis = judge ? 0.5 * (judge.quality / 10) + 0.5 * tech : tech;
  const comp = judge ? clamp01(judge.composition / 10) : c.score.neutralComposition;
  const br = brand == null ? c.score.neutralBrand : clamp01(brand);
  const div = diversity == null ? 1 : clamp01(diversity);
  const issues = judge && Array.isArray(judge.issues) ? judge.issues : [];
  const w = c.score.weights;
  const total = w.sem * sem + w.vis * vis + w.res * clamp01(technical.resolution) + w.aspect * clamp01(technical.aspect)
    + w.comp * comp + w.brand * br + w.dur * clamp01(technical.duration) + w.div * div - c.score.issuePenalty * issues.length;
  return {
    sem: round(sem), vis: round(vis), comp: round(comp), brand: round(br), diversity: round(div),
    total: round(clamp(total, -5, 5)), excluded: issues.includes("unsafe"),
  };
}

function acceptance({ type, judge = null, total, lexical, tech, excluded = false, cfg }) {
  const c = cfg || resolveScoringSettings(null);
  const none = { low: false, medium: false, high: false };
  if (excluded) return { accepted: false, rule: null, reason: "unsafe", byIntensity: none };
  if (judge) {
    if (judge.bestLayout === "none") return { accepted: false, rule: "judge", reason: "judge_unusable", byIntensity: none };
    const minTotal = type === "image" ? c.accept.imageTotal : c.accept.videoTotal;
    const relOk = judge.relevance >= c.accept.minRelevance - 1e-9;
    const totOk = total >= minTotal - 1e-9;
    const ok = relOk && totOk;
    return { accepted: ok, rule: "judge", reason: ok ? null : (relOk ? "total" : "relevance"), byIntensity: { low: ok, medium: ok, high: ok } };
  }
  const lo = c.accept.lexicalOnly;
  const ok = lexical != null && lexical >= lo.minLex - 1e-9 && tech >= lo.minTech - 1e-9;
  return { accepted: ok, rule: "lexical_only", reason: ok ? null : "lexical_only_threshold", byIntensity: { low: false, medium: ok, high: ok } };
}

function scoreEntries({ entries = [], judgeSlot = null, chosen = [], palette = [], lang = "en", cfg = null } = {}) {
  const c = cfg || resolveScoringSettings(null);
  const judgeOk = !!(judgeSlot && judgeSlot.status === "ok");
  return entries.map((e) => {
    const judge = judgeOk && judgeSlot.byKey ? (judgeSlot.byKey[e.key] || null) : null;
    const tags = tagTokens(e.candidate, lang);
    let maxJ = 0;
    for (const ch of chosen) maxJ = Math.max(maxJ, jaccard(tags, ch.tags));
    const brand = brandFit(e.color || e.candidate.dominantColor, palette, c.score.brandColorScale);
    const scores = computeTotal({ lexical: e.lexical.lexical, technical: e.technical, judge, brand, diversity: 1 - maxJ, cfg: c });
    const acc = acceptance({ type: e.candidate.type, judge, total: scores.total, lexical: e.lexical.lexical, tech: e.technical.tech, excluded: scores.excluded, cfg: c });
    return { ...e, judge, tags, scores, acc, authorKey: e.authorKey !== undefined ? e.authorKey : authorKey(e.candidate) };
  }).sort((a, b) => (b.scores.total - a.scores.total) || ((b.prior || 0) - (a.prior || 0)) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function selectBest(scored, { chosen = [], mediaPreference = "video", allowImages = true, crossSlotHamming = 10 } = {}) {
  const chosenKeys = new Set(chosen.map((c) => c.key));
  const chosenAuthors = new Set(chosen.map((c) => c.author).filter(Boolean));
  const blocked = new Map();
  const blockReason = (e, sameAuthorOk) => {
    if (!e.acc.accepted) return e.acc.reason || "not_accepted";
    if (!allowImages && e.candidate.type !== "video") return "images_disabled";
    if (chosenKeys.has(e.key)) return "used_by_other_slot";
    if (e.dhash && chosen.some((c) => c.dhash && hammingHex(e.dhash, c.dhash) <= crossSlotHamming)) return "near_duplicate_of_other_slot";
    if (!sameAuthorOk && e.authorKey && chosenAuthors.has(e.authorKey)) return "same_author";
    return null;
  };
  const orders = mediaPreference === "image" ? ["image", "video"] : (mediaPreference === "either" ? [null] : ["video", "image"]);
  // Media preference outranks author diversity: a second clip by the same author beats falling back to a still.
  for (const type of orders) {
    for (const sameAuthorOk of [false, true]) {
      for (const e of scored) {
        if (type != null && e.candidate.type !== type) continue;
        const why = blockReason(e, sameAuthorOk);
        if (why) { if (!blocked.has(e.key) || why !== "same_author") blocked.set(e.key, why); continue; }
        blocked.delete(e.key);
        return { best: e, blocked };
      }
    }
  }
  return { best: null, blocked };
}

function toAssetRef(e, slot = {}) {
  const c = e.candidate;
  const j = e.judge || null;
  const dims = sourceDims(c);
  const need = num(slot.clipNeedSec) || 0;
  const d = num(c.durationSec);
  const trimInSec = c.type === "video" && d != null && need > 0 && d >= need + 1 ? round(Math.min(1, (d - need) / 2), 3) : 0;
  const s = e.scores || {};
  return {
    assetId: c.assetId,
    provider: c.provider,
    providerId: String(c.providerId).slice(0, 120),
    type: c.type,
    path: null,
    thumbPath: e.thumbPath ? String(e.thumbPath).slice(0, 512) : null,
    sourceUrl: c.pageUrl ? c.pageUrl.slice(0, 2048) : null,
    license: String(c.license || "").slice(0, 120),
    attribution: c.attribution ? String(c.attribution).slice(0, 300) : null,
    width: Math.max(0, Math.round(dims.w || 0)),
    height: Math.max(0, Math.round(dims.h || 0)),
    durationSec: c.type === "video" && d != null && d >= 0 ? round(d, 3) : null,
    trimInSec,
    dhash: e.dhash || null,
    tags: (c.tags || []).slice(0, 60).map((t) => String(t).slice(0, 60)),
    scores: {
      lexical: round(clamp01(e.lexical && e.lexical.lexical != null ? e.lexical.lexical : 0)),
      judgeRelevance: j ? clamp(j.relevance, 0, 10) : null,
      judgeQuality: j ? clamp(j.quality, 0, 10) : null,
      issues: j ? j.issues.slice(0, 12).map((x) => String(x).slice(0, 40)) : [],
      resolution: round(clamp01(e.technical.resolution)),
      aspect: round(clamp01(e.technical.aspect)),
      composition: round(clamp01(s.comp)),
      brand: round(clamp01(s.brand)),
      duration: round(clamp01(e.technical.duration)),
      diversity: round(clamp01(s.diversity)),
      total: round(clamp(Number(s.total) || 0, -5, 5)),
    },
  };
}

function paletteOf(projectSettings) {
  const p = projectSettings && projectSettings.brand && projectSettings.brand.palette;
  return isPlain(p) ? [p.primary, p.secondary].filter((x) => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x)) : [];
}

async function prepareSlot(slot, ctx) {
  const { cfg, output, lang, projectDir, workDir, fetchImpl, signal, pidFile, fontDir, log, settings } = ctx;
  const raw = Array.isArray(ctx.candidatesBySlot[slot.slotId]) ? ctx.candidatesBySlot[slot.slotId] : [];
  const dropped = [];
  const pre = rankPrior({ slot, candidates: raw, output, lang, opts: { topK: cfg.prior.preThumbK }, settings });
  dropped.push(...pre.dropped);

  const thumbDir = path.join(projectDir, THUMBS_REL, slot.slotId);
  const fetched = await mapLimit(pre.top, cfg.sheet.thumbConcurrency, async (r) => {
    const urls = frameUrls(r.candidate);
    const frames = [];
    const reasons = [];
    for (let k = 0; k < urls.length; k++) {
      const res = await downloadThumb({
        url: urls[k], dest: path.join(thumbDir, `${r.candidate.assetId}-${k}`), fetch: fetchImpl, signal,
        maxBytes: cfg.sheet.thumbMaxBytes, timeoutMs: cfg.sheet.thumbTimeoutMs,
      });
      if (res.ok) frames.push(res.file); else reasons.push(res.reason);
    }
    return { r, frames, reasons };
  });
  const withFrames = [];
  for (const f of fetched) {
    if (!f.frames.length) { dropped.push({ key: f.r.key, reasons: ["no_thumbnail", ...new Set(f.reasons)].slice(0, 4) }); continue; }
    withFrames.push({ key: f.r.key, candidate: f.r.candidate, frames: f.frames });
  }

  const files = withFrames.flatMap((e) => e.frames);
  const hashes = files.length ? await hashImages(files, { workDir, signal, pidFile }) : [];
  const byFile = new Map(hashes.map((h) => [h.file, h]));
  for (const e of withFrames) {
    const rep = e.frames[representativeIndex(e.frames.length)];
    const h = byFile.get(rep);
    const any = h && h.dhash ? h : e.frames.map((f) => byFile.get(f)).find((x) => x && x.dhash);
    e.dhash = any ? any.dhash : null;
    e.stdev = any ? any.stdev : null;
    e.color = any ? any.color : null;
    e.thumbPath = relOf(projectDir, rep);
  }

  const stats = new Map(withFrames.map((e) => [e.key, { stdev: e.stdev }]));
  const final = rankPrior({ slot, candidates: withFrames.map((e) => e.candidate), output, lang, stats, opts: { topK: 1000 }, settings });
  dropped.push(...final.dropped);
  const info = new Map(withFrames.map((e) => [e.key, e]));
  const entries = final.ranked.map((r) => {
    const x = info.get(r.key);
    return { ...r, frames: x.frames, dhash: x.dhash, stdev: x.stdev, color: x.color, thumbPath: x.thumbPath, authorKey: authorKey(r.candidate) };
  });
  const { kept, removed } = dedupeByHash(entries, { maxDistance: cfg.dedupe.withinSlotHamming });
  for (const x of removed) dropped.push({ key: x.item.key, reasons: ["near_duplicate"], dupOf: x.dupOf, distance: x.distance });
  const top = kept.slice(0, cfg.prior.topK);

  const lettered = assignLetters(slot.slotId, top);
  for (const l of lettered) l.item.letter = l.letter;
  let sheet = null;
  if (lettered.length) {
    try {
      sheet = await buildContactSheet({
        cells: lettered.map((l) => ({ letter: l.letter, frames: l.item.frames })),
        outFile: path.join(projectDir, SHEETS_REL, `${slot.slotId}.jpg`), workDir, fontDir, signal, pidFile,
        cellW: cfg.sheet.cellW, cellH: cfg.sheet.cellH, cols: cfg.sheet.cols, maxLongEdge: cfg.sheet.maxLongEdge,
        quality: cfg.sheet.quality, fontFile: cfg.sheet.fontFile, fontSize: cfg.sheet.fontSize,
      });
    } catch (e) {
      if (isCancel(e, signal)) throw isEditError(e) && e.errorClass === "cancelled" ? e : cancelledError("sheet aborted");
      log.warn(`[video-edit] broll contact sheet failed slot=${slot.slotId} code=${(e && e.code) || "error"}`);
    }
  }
  return { slot, top, lettered, sheet, dropped, rawCount: raw.length };
}

function detailOf(e, projectDir) {
  const c = e.candidate;
  return {
    key: e.key, letter: e.letter || null, rank: c.rank, query: c.query, prior: e.prior, rankScore: e.rankScore,
    lexical: e.lexical,
    technical: {
      tech: e.technical.tech, layout: e.technical.layout, fitLayouts: e.technical.fitLayouts, upscale: e.technical.upscale,
      coverLoss: e.technical.coverLoss, resolution: e.technical.resolution, aspect: e.technical.aspect,
      duration: e.technical.duration, grey: e.technical.grey, reasons: e.technical.reasons,
    },
    judge: e.judge || null,
    scores: e.scores,
    accepted: e.acc.accepted, acceptedByIntensity: e.acc.byIntensity, rule: e.acc.rule, reason: e.acc.reason,
    blocked: e.blockedReason || null,
    frames: (e.frames || []).map((f) => relOf(projectDir, f)), stdev: e.stdev, color: e.color,
    author: c.author, pageUrl: c.pageUrl, renditions: c.renditions.slice(0, 8),
  };
}

async function scoreSlots(opts = {}) {
  const {
    slots = [], candidatesBySlot = {}, projectDir, output = {}, projectSettings = {}, lang = "en", fetch: fetchImpl = null,
    callJson = null, signal = null, tracker = null, settings = null, fontDir = DEFAULT_FONT_DIR, writeJson = null,
    cacheDir = null, now = Date.now, onProgress = null, log = noopLog, breaker = null, faults = null, pidFile,
    judgeBlockedReason = null, // e.g. 'cost_cap': the judge is skipped and every slot scores lexical + technical
  } = opts;
  if (typeof projectDir !== "string" || !projectDir) throw new EditError("BROLL_SCORE_BAD_REQUEST", { errorClass: "bug", detail: "projectDir required" });
  const cfg = resolveScoringSettings(settings);
  const broll = isPlain(projectSettings) && isPlain(projectSettings.broll) ? projectSettings.broll : {};
  const intensity = INTENSITIES.includes(broll.intensity) ? broll.intensity : "medium";
  const allowImages = broll.allowImages !== false;
  const allowCloudVision = !(isPlain(projectSettings) && isPlain(projectSettings.privacy) && projectSettings.privacy.allowCloudVision === false);
  const palette = paletteOf(projectSettings);
  const progress = (pct, msg) => { if (typeof onProgress === "function") { try { onProgress(pct, msg); } catch { /* noop */ } } };
  const ownWorkDir = !opts.workDir;
  const workDir = opts.workDir || path.join(projectDir, "work", `broll-${crypto.randomBytes(4).toString("hex")}`);
  const write = typeof writeJson === "function" ? writeJson : async (rel, obj) => {
    const file = fsx.resolveInside(projectDir, rel);
    fsx.ensureDir(path.dirname(file));
    fsx.writeJsonAtomic(file, obj);
    return rel;
  };

  const ordered = (Array.isArray(slots) ? slots : [])
    .filter((s) => isPlain(s) && safeSlotId(s.slotId) === s.slotId)
    .sort((a, b) => ((num(a.rank) ?? 1e9) - (num(b.rank) ?? 1e9)) || (a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0));
  const ctx = { cfg, output, lang, projectDir, workDir, fetchImpl, signal, pidFile, fontDir, log, settings, candidatesBySlot: isPlain(candidatesBySlot) ? candidatesBySlot : {} };

  try {
    const prepared = [];
    for (let i = 0; i < ordered.length; i++) {
      throwIfAborted(signal);
      prepared.push(await prepareSlot(ordered[i], ctx));
      progress(5 + (65 * (i + 1)) / Math.max(1, ordered.length), "Choosing the best shots");
    }

    const toJudge = prepared.filter((p) => p.lettered.length);
    const judged = toJudge.length
      ? await judgeSlots({
        slots: toJudge.map((p) => ({
          slotId: p.slot.slotId, sentenceText: p.slot.text, queries: p.slot.queries, avoid: p.slot.avoid,
          layoutAspect: typeof output.aspect === "string" ? output.aspect : null, brandPalette: palette,
          sheetFile: p.sheet ? p.sheet.file : null,
          letters: p.lettered.map((l) => ({ letter: l.letter, key: l.key, type: l.item.candidate.type, durationSec: l.item.candidate.durationSec })),
        })),
        signal, tracker, callJson, cacheDir, allowCloudVision, breaker, faults, settings, blockedReason: judgeBlockedReason,
        model: cfg.judge.model, escalationModel: cfg.judge.escalationModel, maxSlotsPerCall: cfg.judge.maxSlotsPerCall,
        concurrency: cfg.judge.concurrency, promptVersion: cfg.judge.promptVersion,
      })
      : { status: "unavailable", reason: "no_candidates", bySlot: {}, costUsd: 0, calls: 0, notices: [], models: [] };
    progress(90, "Choosing the best shots");

    const chosen = [];
    const summarySlots = [];
    const files = { scored: SCORED_REL, candidates: {} };
    const scoredAt = Number(now()) || 0;
    for (const p of prepared) {
      throwIfAborted(signal);
      const slot = p.slot;
      const judgeSlot = judged.bySlot[slot.slotId] || null;
      const judgeStatus = judgeSlot && judgeSlot.status === "ok" ? "ok" : "unavailable";
      const judgeReason = judgeStatus === "ok" ? null : (judgeSlot ? judgeSlot.reason : (p.lettered.length ? judged.reason : "no_candidates"));
      const scored = scoreEntries({ entries: p.top, judgeSlot, chosen, palette, lang, cfg });
      const { best, blocked } = selectBest(scored, { chosen, mediaPreference: slot.mediaPreference, allowImages, crossSlotHamming: cfg.dedupe.crossSlotHamming });
      for (const e of scored) e.blockedReason = blocked.get(e.key) || null;
      if (best) chosen.push({ key: best.key, author: best.authorKey, dhash: best.dhash, tags: best.tags });

      const refs = scored.map((e) => toAssetRef(e, slot));
      const bestRef = best ? refs[scored.indexOf(best)] : null;
      const byIntensity = best ? best.acc.byIntensity : { low: false, medium: false, high: false };
      const usable = scored.filter((e) => e.acc.accepted && (allowImages || e.candidate.type === "video"));
      const rel = candidatesRel(slot.slotId);
      await write(rel, {
        schemaVersion: 1, slotId: slot.slotId, sentenceId: slot.sentenceId, scoredAt,
        judge: judgeStatus, judgeReason, judgeModel: judgeSlot && judgeSlot.model ? judgeSlot.model : null,
        needSec: num(slot.clipNeedSec), mediaPreference: slot.mediaPreference || "video", queries: slot.queries || [],
        sheet: p.sheet ? { path: relOf(projectDir, p.sheet.file), width: p.sheet.width, height: p.sheet.height,
          letters: Object.fromEntries(p.lettered.map((l) => [l.letter, l.item.candidate.assetId])) } : null,
        bestAssetId: bestRef ? bestRef.assetId : null,
        candidates: refs,
        details: Object.fromEntries(scored.map((e) => [e.candidate.assetId, detailOf(e, projectDir)])),
        dropped: p.dropped.slice(0, 60),
      });
      files.candidates[slot.slotId] = rel;
      summarySlots.push({
        slotId: slot.slotId, sentenceId: slot.sentenceId,
        accepted: !!byIntensity[intensity], acceptedByIntensity: byIntensity,
        judge: judgeStatus, judgeReason,
        mediaPreference: slot.mediaPreference || "video",
        mediaTypes: [...new Set(usable.map((e) => e.candidate.type))],
        bestTotal: bestRef ? bestRef.scores.total : null,
        best: bestRef, top: refs,
        needsImages: !best && allowImages && !scored.some((e) => e.candidate.type === "image"),
        candidateCount: p.rawCount,
      });
    }

    const acceptedCount = summarySlots.filter((s) => s.accepted).length;
    const notices = [];
    for (const n of judged.notices) notices.push({ code: n.code, severity: "info", message: null });
    if (toJudge.length && judged.status !== "ok") {
      notices.push({ code: "BROLL_JUDGE_UNAVAILABLE", severity: "info", message: "Some B-roll was chosen without a visual check." });
    }
    if (summarySlots.length && acceptedCount === 0) {
      notices.push({ code: "NO_BROLL_FOUND", severity: "warn", message: "Edit uses your footage only." });
    }
    const summary = {
      schemaVersion: 1, scoredAt, intensity, allowImages,
      judge: toJudge.length ? judged.status : "unavailable", judgeReason: judged.reason || null, judgeModels: judged.models,
      costUsd: judged.costUsd,
      counts: { slots: summarySlots.length, accepted: acceptedCount, acceptedAnyIntensity: summarySlots.filter((s) => s.acceptedByIntensity.high).length },
      slots: summarySlots,
    };
    await write(SCORED_REL, summary);
    progress(100, null);
    return { summary, files, costUsd: judged.costUsd, judge: summary.judge, notices, discoveries: { brollMoments: acceptedCount } };
  } finally {
    if (ownWorkDir) { try { await fsx.rmWithRetry(workDir, { attempts: 3 }); } catch { /* temp only */ } }
  }
}

// SEARCHING_BROLL writes analysis/broll_raw/<slotId>.json { items: RawAsset[] } (broll/search.js).
const rawRel = (slotId) => `analysis/broll_raw/${slotId}.json`;
function readRawCandidates(projectDir, slots) {
  const out = {};
  for (const s of Array.isArray(slots) ? slots : []) {
    if (!isPlain(s) || safeSlotId(s.slotId) !== s.slotId) continue;
    let r;
    try { r = fsx.readJsonSafe(fsx.resolveInside(projectDir, rawRel(s.slotId))); } catch { r = null; }
    out[s.slotId] = r && r.ok && isPlain(r.value) && Array.isArray(r.value.items) ? r.value.items : [];
  }
  return out;
}

module.exports = {
  readRawCandidates, rawRel,
  scoreSlots, computeTotal, acceptance, brandFit, tagTokens, jaccard, authorKey, scoreEntries, selectBest, toAssetRef,
  SCORED_REL, THUMBS_REL, SHEETS_REL, candidatesRel, INTENSITIES,
};
