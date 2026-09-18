// VIDEO EDIT SETTINGS PATCH — POST /:id/settings: which setting changes are plan ops, which only need storing, and
// which need the analysis re-run (API.md §3, §7; EDIT_PLAN.md §5).
//
// WHY THIS EXISTS. The editor's settings panel speaks project Settings (API.md §7) while the plan speaks ops. A
// caption style, B-roll intensity or pacing change must become the SAME op a direct edit would send (so undo,
// invalidation, ownership and the no-LLM re-plan rule apply unchanged), while a forced spoken language or turning
// cloud vision back on cannot be honoured without re-running paid analysis stages — which must never happen
// silently. So the patch is normalized onto the stored settings (same zod schema as create), diffed leaf by leaf,
// and every changed key lands in exactly one bucket:
//   ops       — captions.* (enabled/style/lines/position/language), brand.palette, brand.logo.*, music.*, sfx.enabled,
//               broll.intensity, effects.*, removeSilence.*, removeFillers, output.aspect (compared against the plan:
//               a value the plan already has produces no op)
//   stored    — title, goals, autoRender, exportProfile, maxCostUsd, broll.enabled/allowImages, privacy off, a cleared
//               palette / logo placement without a logo (kept on the project; later stages read them)
//   reanalyze — language (from TRANSCRIBING), privacy.allowCloudVision → true (ANALYZING_VIDEO), removeFillers →
//               'aggressive' while discourse filler candidates lack a ve_content verdict (ANALYZING_CONTENT)
// consent cannot change here (422).
//
// CONTRACT (pure):
//   computeSettingsChange({ project, plan, patch, allowDebugFaults=false, maxUsdCap=null, transcriptMeta=null,
//                           content=null, settingKeys=[plan settings.set keys] })
//     -> { errors:[string] } | { errors:null, next, changed:[key], ops:[Op], stored:[key], reanalyze:{ fromStage, keys }|null }
//   needsContentVerdicts({ transcriptMeta, content }) -> boolean
//   nearestAspect(project) -> '9:16'|'16:9'|'1:1'|null
//   reanalysisEstimate(project, fromStage) -> { sec, usdLow, usdHigh, stages:[STAGE] }
//   CAPTION_POSITION_Y

const { normalizeSettings, DEFAULT_SETTINGS, deepMerge } = require("../settings_schema");
const { STAGES } = require("../constants");
const { costEstimateFor } = require("../views");

const CAPTION_POSITION_Y = Object.freeze({ auto: null, top: 0.12, center: 0.5, bottom: 0.82 });
const LEAF_OBJECTS = new Set(["brand.palette"]);
const STORED_KEYS = Object.freeze(["title", "goals", "autoRender", "exportProfile", "maxCostUsd", "debugFaults", "broll.enabled", "broll.allowImages"]);
const ASPECTS = Object.freeze([["9:16", 9 / 16], ["1:1", 1], ["16:9", 16 / 9]]);

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const round3 = (v) => Math.round(v * 1000) / 1000;

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(isPlain(obj) ? obj : {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlain(v) && !LEAF_OBJECTS.has(key)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function nearestAspect(project) {
  const v = project && isPlain(project.source) && isPlain(project.source.video) ? project.source.video : null;
  if (!v) return null;
  let w = Number(v.displayWidth) || Number(v.width);
  let h = Number(v.displayHeight) || Number(v.height);
  if (v.displayWidth == null && v.displayHeight == null && Math.abs(Number(v.rotation) || 0) % 180 === 90) [w, h] = [h, w];
  if (!(w > 0) || !(h > 0)) return null;
  const r = w / h;
  return ASPECTS.slice().sort((a, b) => Math.abs(Math.log(r / a[1])) - Math.abs(Math.log(r / b[1])))[0][0];
}

function needsContentVerdicts({ transcriptMeta = null, content = null } = {}) {
  const cands = transcriptMeta && Array.isArray(transcriptMeta.fillerCandidates)
    ? transcriptMeta.fillerCandidates.filter((f) => isPlain(f) && f.kind === "discourse" && Number.isInteger(f.i)) : [];
  if (!cands.length) return false;
  if (!isPlain(content) || content.deterministic === true) return true;
  const judged = new Set((Array.isArray(content.fillerVerdicts) ? content.fillerVerdicts : []).filter((v) => isPlain(v) && Number.isInteger(v.wordIndex)).map((v) => v.wordIndex));
  return cands.some((f) => !judged.has(f.i));
}

function computeSettingsChange({ project, plan, patch, allowDebugFaults = false, maxUsdCap = null, transcriptMeta = null, content = null, settingKeys = null } = {}) {
  if (!isPlain(patch)) return { errors: ["settings: expected an object"] };
  if (!isPlain(plan) || !isPlain(plan.settings)) return { errors: ["plan: missing"] };
  const stored = isPlain(project && project.settings) ? project.settings : {};
  const cur = normalizeSettings(stored, { allowDebugFaults: true });
  const base = cur.ok ? cur.value : deepMerge(DEFAULT_SETTINGS, {});
  const norm = normalizeSettings(patch, { base, allowDebugFaults, maxUsdCap });
  if (!norm.ok) return { errors: norm.errors };
  const next = norm.value;
  if (!allowDebugFaults && base.debugFaults !== undefined) next.debugFaults = base.debugFaults;

  const a = flatten(base), b = flatten(next);
  const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
  if (changed.some((k) => k === "consent" || k.startsWith("consent."))) return { errors: ["consent: cannot be changed after upload"] };
  const has = (k) => changed.includes(k);
  const ops = [];
  const storedKeys = [];
  const reanalyze = new Map();   // stage -> keys
  const want = (stage, key) => { reanalyze.set(stage, [...(reanalyze.get(stage) || []), key]); };
  const ps = plan.settings;
  const allowedSet = new Set(Array.isArray(settingKeys) ? settingKeys : ["brollIntensity", "effects", "effectsEnabled", "removeFillers", "removeSilence", "silencePace", "autoJumpCuts", "punchInOnJumpCuts"]);
  const setOp = (settingKey, value, key) => {
    if (!allowedSet.has(settingKey)) { storedKeys.push(key); return; }
    if (ps[settingKey] !== value) ops.push({ type: "settings.set", key: settingKey, value });
  };

  if (has("language")) want("TRANSCRIBING", "language");
  if (has("privacy.allowCloudVision")) {
    if (next.privacy.allowCloudVision) want("ANALYZING_VIDEO", "privacy.allowCloudVision");
    else storedKeys.push("privacy.allowCloudVision");
  }

  // `output.aspect` is the one setting whose value is indirect: 'source' means "whatever this footage is",
  // so the SETTINGS diff can be empty while the plan still disagrees (a plan built 9:16 from 16:9 footage).
  // The rule is plan-relative (see header), so an explicit aspect in the patch is evaluated even when the
  // normalized value did not move.
  if (has("output.aspect") || (isPlain(patch.output) && patch.output.aspect !== undefined)) {
    const target = next.output.aspect === "source" ? nearestAspect(project) : next.output.aspect;
    if (target && plan.output && target !== plan.output.aspect) ops.push({ type: "output.setAspect", aspect: target });
    else if (!target) storedKeys.push("output.aspect");
  }

  const caps = plan.captions || {};
  if (has("captions.enabled") && caps.enabled !== next.captions.enabled) ops.push({ type: "captions.setEnabled", enabled: next.captions.enabled });
  if ((has("captions.styleId") || has("captions.maxWordsPerLine"))
    && (caps.styleId !== next.captions.styleId || ps.maxWordsPerLine !== next.captions.maxWordsPerLine)) {
    ops.push({ type: "captions.setStyle", styleId: next.captions.styleId, maxWordsPerLine: next.captions.maxWordsPerLine });
  }
  if (has("captions.position")) {
    const y = CAPTION_POSITION_Y[next.captions.position];
    const current = caps.position && Number.isFinite(caps.position.yOverride) ? caps.position.yOverride : null;
    if (!(y === null && current === null)) ops.push({ type: "captions.setPosition", y });
  }
  if (has("captions.language") && ps.captionLanguage !== next.captions.language) ops.push({ type: "captions.setLanguage", language: next.captions.language });

  if (has("brand.palette")) {
    const pal = next.brand.palette;
    if (pal) ops.push({ type: "branding.setPalette", primary: pal.primary, ...(pal.secondary ? { accent: pal.secondary } : {}), ...(pal.presetId ? { presetId: pal.presetId } : {}) });
    else storedKeys.push("brand.palette");
  }
  if (has("brand.logo.placement") || has("brand.logo.show")) {
    const logo = plan.branding && plan.branding.logo;
    if (logo) ops.push({ type: "branding.setLogoPlacement", placement: next.brand.logo.placement, scale: logo.scale, opacity: logo.opacity, show: next.brand.logo.show });
    else storedKeys.push(...["brand.logo.placement", "brand.logo.show"].filter(has));
  }

  const music = plan.music;
  let musicChange = false;
  if (has("music.volumeDb") && Number.isFinite(next.music.volumeDb)) {
    if (music) ops.push({ type: "music.setVolume", volumeDb: next.music.volumeDb });
    else storedKeys.push("music.volumeDb");
  }
  if (has("music.enabled")) {
    if (!next.music.enabled) { if (music && music.enabled) ops.push({ type: "music.remove" }); }
    else if (music && !music.enabled) ops.push({ type: "music.restore" });
    else if (!music) { ops.push({ type: "music.change", mood: (next.music.mood || "upbeat").slice(0, 40) }); musicChange = true; }
  }
  if (has("music.mood") && next.music.enabled && next.music.mood && !musicChange) ops.push({ type: "music.change", mood: next.music.mood });
  else if (has("music.mood") && !musicChange) storedKeys.push("music.mood");

  if (has("sfx.enabled") && ps.sfxEnabled !== next.sfx.enabled) ops.push({ type: "sfx.muteAll", muted: !next.sfx.enabled });
  if (has("broll.intensity")) setOp("brollIntensity", next.broll.intensity, "broll.intensity");
  if (has("effects.intensity")) setOp("effects", next.effects.intensity, "effects.intensity");
  if (has("effects.autoJumpCuts")) setOp("autoJumpCuts", next.effects.autoJumpCuts, "effects.autoJumpCuts");
  if (has("removeSilence.enabled")) setOp("removeSilence", next.removeSilence.enabled, "removeSilence.enabled");
  if (has("removeSilence.pace")) setOp("silencePace", next.removeSilence.pace, "removeSilence.pace");
  if (has("removeFillers")) {
    if (next.removeFillers === "aggressive" && needsContentVerdicts({ transcriptMeta, content })) want("ANALYZING_CONTENT", "removeFillers");
    else setOp("removeFillers", next.removeFillers, "removeFillers");
  }
  for (const k of STORED_KEYS) if (has(k)) storedKeys.push(k);

  let re = null;
  if (reanalyze.size) {
    const fromStage = [...reanalyze.keys()].sort((x, y) => STAGES.indexOf(x) - STAGES.indexOf(y))[0];
    re = { fromStage, keys: [...reanalyze.values()].flat() };
  }
  return { errors: null, next, changed, ops, stored: [...new Set(storedKeys)], reanalyze: re };
}

const STAGE_SEC = Object.freeze({
  TRANSCRIBING: (D) => 20 + 0.5 * D, ANALYZING_VIDEO: (D) => 15 + 0.4 * D, ANALYZING_CONTENT: () => 25,
  SEARCHING_BROLL: () => 20, SCORING_ASSETS: () => 30, BUILDING_EDIT_PLAN: () => 15,
});
const STAGE_COST_SHARE = Object.freeze({
  TRANSCRIBING: 0.55, ANALYZING_VIDEO: 0.2, ANALYZING_CONTENT: 0.1, SEARCHING_BROLL: 0, SCORING_ASSETS: 0.1, BUILDING_EDIT_PLAN: 0.05,
});

// Rough, documented estimate for the confirmation dialog. ANALYZING_VIDEO runs beside the audio chain, so forcing
// TRANSCRIBING or ANALYZING_CONTENT does not re-run it; forcing ANALYZING_VIDEO re-runs everything after it.
function reanalysisEstimate(project, fromStage) {
  const D = Number(project && project.source && project.source.durationSec) > 0 ? Number(project.source.durationSec) : 60;
  const from = STAGES.indexOf(fromStage);
  const list = STAGES.filter((s, k) => k >= from && STAGE_SEC[s] && (fromStage === "ANALYZING_VIDEO" || s !== "ANALYZING_VIDEO"));
  const sec = list.reduce((n, s) => n + STAGE_SEC[s](D), 0);
  const share = list.reduce((n, s) => n + STAGE_COST_SHARE[s], 0);
  const cap = project && project.cost && Number(project.cost.capUsd) > 0 ? Number(project.cost.capUsd) : null;
  const full = costEstimateFor(D, { capUsd: cap });
  return { sec: Math.round(sec), usdLow: round3(full.usdLow * share), usdHigh: round3(full.usdHigh * share), stages: list };
}

module.exports = { computeSettingsChange, needsContentVerdicts, nearestAspect, reanalysisEstimate, CAPTION_POSITION_Y };
