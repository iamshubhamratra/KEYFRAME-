// VIDEO EDIT VIEWS — the only shapes of a project that ever leave the server.
//
// WHY THIS EXISTS. project.json is an engine record: it holds file paths (stage outputs, render files),
// hashes, provider task ids, stderr tails in `errors[].detail`, run ids and the owner id. None of that
// belongs in a browser, and a route that serialized the record "minus a few fields" would leak whatever
// the next phase adds. So views are built by WHITELIST from pure functions (API.md §4): every field is
// copied deliberately, type-checked and length-capped; unknown fields are dropped by construction.
// Media is referenced only by route URLs (`/api/video-edits/<id>/media/poster`), never by path.
//
// CONTRACT (pure; no I/O, no clock unless passed):
//   toSummary(project, { basePath }) -> ProjectSummary
//   toProjectView(project, { now, basePath, queuePosition }) -> ProjectView
//   toProgress(project, { queuePosition }) -> { status, stage, stagePct, overallPct, etaSec, queuePosition,
//                                               planRevision, activeRenderId, updatedAt }
//   allowedActionsFor(project) -> ['cancel'|'retry'|'render'|'export'|'delete'|'edit']
//   discoveriesView(discoveries) -> whitelisted partial discoveries (also applied to SSE `discovery` events)
//   costEstimateFor(durationSec, { capUsd, perMinute, fixed }) -> { usdLow, usdHigh }
//   BASE_PATH · COST_PER_MINUTE_USD

const { STAGES, STAGE_STATUSES, STATUSES } = require("./constants");
const { SettingsSchema } = require("./settings_schema");

const BASE_PATH = "/api/video-edits";
// ARCHITECTURE.md cost table (KIE/OpenRouter route); real spend is recorded per call by later phases.
const COST_PER_MINUTE_USD = Object.freeze({ low: 0.02, high: 0.07 });
const FIXED_COST_USD = Object.freeze({ low: 0.005, high: 0.02 });
const RENDER_ID_RE = /^rd_[0-9a-z]{8}$/;
const CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const STAGE_RE = /^[A-Z][A-Z0-9_]{1,40}$/;
const ORIENTATIONS = ["portrait", "landscape", "square"];
const ACTION_RE = /^[a-z_]{1,40}$/;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const nonNeg = (v) => { const n = num(v); return n != null && n >= 0 ? n : null; };
const int = (v) => (Number.isInteger(v) ? v : null);
const text = (v, max) => (typeof v === "string" && v.length ? v.slice(0, max) : null);
const code = (v) => (typeof v === "string" && CODE_RE.test(v) ? v : null);
const stageName = (v) => (typeof v === "string" && STAGE_RE.test(v) ? v : null);
const pct = (v) => { const n = num(v); return n == null ? 0 : Math.max(0, Math.min(100, Math.round(n * 10) / 10)); };
const round3 = (v) => Math.round(v * 1000) / 1000;

function orientationOf(w, h) {
  if (!(w > 0) || !(h > 0)) return null;
  const r = w / h;
  if (Math.abs(r - 1) <= 0.02) return "square";
  return r > 1 ? "landscape" : "portrait";
}

function displayDims(src) {
  const v = isPlain(src) && isPlain(src.video) ? src.video : {};
  const rotation = num(v.rotation) || 0;
  let width = num(v.displayWidth) ?? num(v.width);
  let height = num(v.displayHeight) ?? num(v.height);
  if (v.displayWidth == null && v.displayHeight == null && Math.abs(rotation) % 180 === 90 && width && height) {
    [width, height] = [height, width];
  }
  return { width, height, rotation, fps: num(v.fps) };
}

function titleOf(p) {
  const t = text(p.title, 120);
  if (t) return t;
  const dn = isPlain(p.source) ? text(p.source.displayName, 80) : null;
  if (dn) return dn.replace(/\.[A-Za-z0-9]{1,5}$/, "") || dn;
  return "Untitled edit";
}

function stageRecord(p, name) {
  return isPlain(p.stages) && isPlain(p.stages[name]) ? p.stages[name] : null;
}

function posterReady(p) {
  const rec = stageRecord(p, "COMPRESSING");
  return !!(rec && rec.status === "done" && isPlain(rec.outputs) && isPlain(rec.outputs.poster));
}

function currentExport(p) {
  const id = isPlain(p.exports) && typeof p.exports.currentId === "string" && RENDER_ID_RE.test(p.exports.currentId) ? p.exports.currentId : null;
  const rec = id && Array.isArray(p.renders) ? p.renders.find((r) => isPlain(r) && r.id === id) || null : null;
  return { id, rec };
}

function toSummary(project, { basePath = BASE_PATH } = {}) {
  const p = isPlain(project) ? project : {};
  const src = isPlain(p.source) ? p.source : null;
  const dims = displayDims(src);
  const progress = isPlain(p.progress) ? p.progress : {};
  const disc = isPlain(p.discoveries) ? p.discoveries : {};
  const exp = currentExport(p);
  return {
    id: typeof p.id === "string" ? p.id : null,
    title: titleOf(p),
    status: STATUSES.includes(p.status) ? p.status : "NEEDS_ATTENTION",
    stage: stageName(progress.stage),
    overallPct: pct(progress.overallPct),
    createdAt: nonNeg(p.createdAt),
    updatedAt: nonNeg(p.updatedAt),
    lastOpenedAt: nonNeg(p.lastOpenedAt),
    durationSec: src ? nonNeg(src.durationSec) : null,
    outputDurationSec: exp.rec ? (nonNeg(exp.rec.durationSec) ?? nonNeg(exp.rec.outputDurationSec)) : null,
    orientation: orientationOf(dims.width, dims.height) || (ORIENTATIONS.includes(disc.orientation) ? disc.orientation : null),
    posterUrl: posterReady(p) && typeof p.id === "string" ? `${basePath}/${p.id}/media/poster` : null,
    currentExportId: exp.id,
    qaVerdict: isPlain(p.qaSummary) ? text(p.qaSummary.verdict, 16) : null,
  };
}

function reasonView(r) {
  if (!isPlain(r)) return null;
  return {
    code: code(r.code) || "UNKNOWN",
    message: text(r.message, 300),
    retryable: !!r.retryable,
    stage: stageName(r.stage),
    actions: Array.isArray(r.actions) ? r.actions.filter((a) => typeof a === "string" && ACTION_RE.test(a)).slice(0, 8) : [],
  };
}

function sourceView(src) {
  if (!isPlain(src)) return null;
  const dims = displayDims(src);
  return {
    displayName: text(src.displayName, 80) || "video",
    sizeBytes: nonNeg(src.sizeBytes),
    durationSec: nonNeg(src.durationSec),
    width: dims.width,
    height: dims.height,
    fps: dims.fps,
    rotation: dims.rotation,
    hasAudio: !!(isPlain(src.audio) || (Array.isArray(src.audio) && src.audio.length)),
    orientation: orientationOf(dims.width, dims.height),
  };
}

function settingsView(settings) {
  const r = SettingsSchema.safeParse(isPlain(settings) ? settings : {});
  if (!r.success) return null;
  const out = r.data;
  delete out.debugFaults;
  return out;
}

function consentView(c) {
  const x = isPlain(c) ? c : {};
  return { thirdPartyAi: x.thirdPartyAi === true, termsVersion: text(x.termsVersion, 40), at: nonNeg(x.at) };
}

function stagesView(stages) {
  const out = {};
  if (!isPlain(stages)) return out;
  const names = [...STAGES.filter((n) => isPlain(stages[n])), ...Object.keys(stages).filter((n) => !STAGES.includes(n) && STAGE_RE.test(n) && isPlain(stages[n]))];
  for (const name of names) {
    const s = stages[name];
    const v = {
      status: STAGE_STATUSES.includes(s.status) ? s.status : "pending",
      attempts: int(s.attempts) != null && s.attempts >= 0 ? s.attempts : 0,
      fallbacks: Array.isArray(s.fallbacks) ? s.fallbacks.filter((f) => typeof f === "string").slice(0, 10).map((f) => f.slice(0, 60)) : [],
    };
    const engine = text(s.engine, 40);
    if (engine) v.engine = engine;
    if (nonNeg(s.durationMs)) v.durationMs = s.durationMs;
    if (nonNeg(s.costUsd)) v.costUsd = s.costUsd;
    out[name] = v;
  }
  return out;
}

const DISCOVERY_RULES = {
  language: (v) => (typeof v === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(v) ? v : undefined),
  words: nonNeg, wpm: nonNeg, fillersFound: nonNeg, silencesFound: nonNeg, silenceSec: nonNeg, brollMoments: nonNeg,
  durationSec: nonNeg, width: nonNeg, height: nonNeg, fps: nonNeg,
  topics: (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string" && s).slice(0, 12).map((s) => s.slice(0, 60)) : undefined),
  hook: (v) => text(v, 200) ?? undefined,
  faceFound: (v) => (typeof v === "boolean" ? v : undefined),
  posterReady: (v) => (typeof v === "boolean" ? v : undefined),
  orientation: (v) => (ORIENTATIONS.includes(v) ? v : undefined),
  onScreenText: (v) => (Array.isArray(v)
    ? v.filter((r) => Array.isArray(r) && r.length === 2 && num(r[0]) != null && num(r[1]) != null).slice(0, 50).map((r) => [r[0], r[1]])
    : undefined),
};

function discoveriesView(d) {
  const out = {};
  if (!isPlain(d)) return out;
  for (const [k, rule] of Object.entries(DISCOVERY_RULES)) {
    if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
    const v = rule(d[k]);
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

function planView(plan) {
  if (!isPlain(plan) || !(int(plan.headRevision) > 0)) return null;
  return {
    headRevision: plan.headRevision,
    headHash: typeof plan.headHash === "string" && /^[0-9a-f]{64}$/.test(plan.headHash) ? plan.headHash : null,
    canUndo: Array.isArray(plan.undo) && plan.undo.length > 0,
    canRedo: Array.isArray(plan.redo) && plan.redo.length > 0,
  };
}

const RENDER_STATUSES = ["queued", "running", "done", "failed", "cancelled", "interrupted"];

function rendersView(renders) {
  if (!Array.isArray(renders)) return [];
  // Field names follow the editor client (renderId / planRevision). QA repair laps are internal (`hidden`) unless shipped.
  return renders.filter((r) => isPlain(r) && typeof r.id === "string" && RENDER_ID_RE.test(r.id) && !r.hidden).slice(-50).map((r) => ({
    renderId: r.id,
    kind: r.kind === "export" ? "export" : "preview",
    planRevision: int(r.planRev),
    stage: typeof r.stage === "string" && /^[A-Z_]{3,40}$/.test(r.stage) ? r.stage : null,
    planHash: typeof r.planHash === "string" && /^[0-9a-f]{64}$/.test(r.planHash) ? r.planHash : null,
    profile: typeof r.profile === "string" && /^[a-z0-9_]{1,20}$/.test(r.profile) ? r.profile : null,
    status: RENDER_STATUSES.includes(r.status) ? r.status : "failed",
    pct: pct(r.pct),
    createdAt: nonNeg(r.createdAt),
    finishedAt: nonNeg(r.finishedAt),
    durationSec: nonNeg(r.durationSec),
    segments: isPlain(r.segments) ? { total: nonNeg(r.segments.total) || 0, cacheHits: nonNeg(r.segments.cacheHits) || 0 } : null,
    qa: isPlain(r.qa) ? { verdict: text(r.qa.verdict, 16), score: num(r.qa.score), unverified: !!r.qa.unverified } : null,
    error: isPlain(r.error) ? { code: code(r.error.code) || "RENDER_FAILED", message: text(r.error.message, 300) } : null,
  }));
}

function qaView(q) {
  if (!isPlain(q)) return null;
  const c = isPlain(q.counts) ? q.counts : {};
  return {
    // Engine verdicts (clean/review/weak/blocked, 0–100) read as the editor's pass/review/fail and 0–10.
    verdict: q.verdict === "clean" ? "pass" : q.verdict === "weak" || q.verdict === "blocked" ? "fail" : text(q.verdict, 16),
    score: num(q.score) != null && q.score > 10 ? Math.round(q.score) / 10 : num(q.score),
    headline: text(q.headline, 200),
    counts: {
      blockers: nonNeg(c.blockers) || 0, majors: nonNeg(c.majors) || 0, minors: nonNeg(c.minors) || 0,
      fail: nonNeg(c.blockers) || 0, warn: (nonNeg(c.majors) || 0) + (nonNeg(c.minors) || 0),
    },
  };
}

function noticesView(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((n) => isPlain(n) && code(n.code)).slice(-50).map((n) => ({
    code: n.code,
    severity: n.severity === "warn" ? "warn" : "info",
    stage: stageName(n.stage),
    message: text(n.message, 300),
  }));
}

function costView(c) {
  const x = isPlain(c) ? c : {};
  return { estimateUsd: nonNeg(x.estimateUsd) || 0, capUsd: nonNeg(x.capUsd) || 0, spentUsd: nonNeg(x.spentUsd) || 0 };
}

function allowedActionsFor(project) {
  const p = isPlain(project) ? project : {};
  if (p.storeCorrupt) return ["delete"];
  const hasPlan = isPlain(p.plan) && int(p.plan.headRevision) > 0;
  const retryable = !(isPlain(p.statusReason) && p.statusReason.retryable === false);
  switch (p.status) {
    case "QUEUED":
    case "PROCESSING": return ["cancel", "delete"];
    case "RENDERING": return hasPlan ? ["cancel", "edit", "delete"] : ["cancel", "delete"];
    case "READY":
    case "COMPLETED": return hasPlan ? ["render", "export", "edit", "delete"] : ["delete"];
    case "NEEDS_ATTENTION": return [...(retryable ? ["retry"] : []), ...(hasPlan ? ["edit"] : []), "delete"];
    case "CANCELLED": return ["retry", "delete"];
    case "FAILED": return ["delete"];
    default: return [];
  }
}

function queuePositionOf(p, override) {
  if (p.status !== "QUEUED") return null;
  if (Number.isInteger(override) && override > 0) return override;
  const q = isPlain(p.progress) ? p.progress.queuePosition : null;
  return Number.isInteger(q) && q > 0 ? q : null;
}

function toProjectView(project, { now = null, basePath = BASE_PATH, queuePosition = null } = {}) {
  void now; // views are pure; `now` is accepted for future relative fields (e.g. export staleness age)
  const p = isPlain(project) ? project : {};
  const summary = toSummary(p, { basePath });
  const progress = isPlain(p.progress) ? p.progress : {};
  return {
    ...summary,
    mode: "AI_VIDEO_EDIT",
    statusReason: reasonView(p.statusReason),
    progress: {
      stage: summary.stage,
      stagePct: pct(progress.stagePct),
      overallPct: summary.overallPct,
      message: text(progress.message, 200),
      stageStartedAt: nonNeg(progress.stageStartedAt) || null,
      etaSec: nonNeg(progress.etaSec),
      queuePosition: queuePositionOf(p, queuePosition),
    },
    source: sourceView(p.source),
    settings: settingsView(p.settings),
    consent: consentView(p.consent),
    stages: stagesView(p.stages),
    discoveries: discoveriesView(p.discoveries),
    plan: planView(p.plan),
    renders: rendersView(p.renders),
    exports: { currentId: summary.currentExportId, stale: !!(isPlain(p.exports) && p.exports.stale) },
    qaSummary: qaView(p.qaSummary),
    notices: noticesView(p.notices),
    cost: costView(p.cost),
    allowedActions: allowedActionsFor(p),
  };
}

function toProgress(project, { queuePosition = null } = {}) {
  const p = isPlain(project) ? project : {};
  const progress = isPlain(p.progress) ? p.progress : {};
  const active = Array.isArray(p.renders) ? p.renders.find((r) => isPlain(r) && RENDER_ID_RE.test(String(r.id)) && (r.status === "queued" || r.status === "running")) : null;
  return {
    status: STATUSES.includes(p.status) ? p.status : "NEEDS_ATTENTION",
    stage: stageName(progress.stage),
    stagePct: pct(progress.stagePct),
    overallPct: pct(progress.overallPct),
    etaSec: nonNeg(progress.etaSec),
    queuePosition: queuePositionOf(p, queuePosition),
    planRevision: isPlain(p.plan) && int(p.plan.headRevision) > 0 ? p.plan.headRevision : 0,
    activeRenderId: active ? active.id : null,
    updatedAt: nonNeg(p.updatedAt),
  };
}

function costEstimateFor(durationSec, { capUsd = null, perMinute = COST_PER_MINUTE_USD, fixed = FIXED_COST_USD } = {}) {
  const minutes = Math.max(1 / 60, (nonNeg(durationSec) || 0) / 60);
  let low = fixed.low + perMinute.low * minutes;
  let high = fixed.high + perMinute.high * minutes;
  if (nonNeg(capUsd) != null && capUsd > 0) {
    high = Math.min(high, capUsd);
    low = Math.min(low, high);
  }
  return { usdLow: round3(low), usdHigh: round3(high) };
}

module.exports = {
  toSummary, toProjectView, toProgress, allowedActionsFor, costEstimateFor, orientationOf, discoveriesView, settingsView,
  BASE_PATH, COST_PER_MINUTE_USD, FIXED_COST_USD,
  // Edit Plan, history, transcript, candidate and op-result whitelists (views_plan.js).
  ...require("./views_plan"),
};
