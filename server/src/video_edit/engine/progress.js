// VIDEO EDIT PROGRESS & ETA — turn ffmpeg output and stage history into honest percentages.
//
// WHY THIS EXISTS. An edit takes minutes and users leave tabs open watching it. A bar that jumps
// or an ETA that lies ("30 s" for five minutes) reads as a hang. Three pieces keep it honest:
//   1. createProgressParser — ffmpeg `-progress pipe:1` arrives in arbitrary chunks, lines split
//      across reads; `out_time_ms` is (despite its name) microseconds, like `out_time_us`.
//   2. STAGE_WEIGHTS / overallPct — one pipeline-wide percentage from per-stage percentages,
//      weighted by typical cost (ENGINE.md §5.4; weights sum to 100).
//   3. createEtaModel — per-stage cost model `(a + b·D·px·cf)·ratio`, where `ratio` is an EWMA
//      (α 0.3) of actual/predicted persisted in `_metrics/stage-rates.json`, so the model learns
//      this host's real speed; the running stage blends 50/50 with the observed rate once >5 %.
//
// CONTRACT:
//   createProgressParser(expectedDurationSec, onPct) -> (chunk) => void   onPct(pct|null, { outTimeSec, speed, done })
//   STAGE_WEIGHTS · overallPct(stagesMap, currentStage, stagePct) -> 0..100
//   createEtaModel({ settings, file }) -> { estimate(stage, { durationSec, pixels, cpus }) -> sec,
//        remaining(stage, { durationSec, pixels, cpus, stagePct, elapsedMs }) -> sec,
//        record(stage, actualMs, predictedMs), save(), ratios() }

const path = require("node:path");
const fsx = require("../fsx");
const { STAGES } = require("../constants");

const STAGE_WEIGHTS = Object.freeze({
  VALIDATING: 2, COMPRESSING: 12, EXTRACTING_AUDIO: 3, TRANSCRIBING: 18, ANALYZING_VIDEO: 8, ANALYZING_CONTENT: 6,
  SEARCHING_BROLL: 5, SCORING_ASSETS: 6, BUILDING_EDIT_PLAN: 8, PREPARING_RENDER: 5, RENDERING: 17, POST_PROCESSING: 5,
  QUALITY_CHECK: 5,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function parseClock(s) {
  const m = /^(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(String(s).trim());
  if (!m) return null;
  const v = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
  return m[1] ? -v : v;
}

function createProgressParser(expectedDurationSec, onPct) {
  const expected = Number(expectedDurationSec) > 0 ? Number(expectedDurationSec) : null;
  let buf = "";
  let block = {};
  let best = 0;
  let done = false;

  function emit() {
    let outTimeSec = null;
    const us = Number(block.out_time_us), ms = Number(block.out_time_ms);
    if (block.out_time_us != null && Number.isFinite(us) && us >= 0) outTimeSec = us / 1e6;
    else if (block.out_time_ms != null && Number.isFinite(ms) && ms >= 0) outTimeSec = ms / 1e6;   // µs despite the name
    else if (block.out_time != null) { const c = parseClock(block.out_time); if (c != null && c >= 0) outTimeSec = c; }
    const speedM = /^([\d.]+)x$/.exec(String(block.speed || "").trim());
    const speed = speedM ? Number(speedM[1]) : null;
    const end = block.progress === "end";
    let pct = null;
    if (end) { pct = 100; done = true; }
    else if (expected && outTimeSec != null) {
      best = Math.max(best, clamp((outTimeSec / expected) * 100, 0, 99.9));
      pct = Math.round(best * 10) / 10;
    }
    try { onPct(pct, { outTimeSec, speed, done: end }); } catch { /* progress is an enhancement */ }
    block = {};
  }

  return function feed(chunk) {
    if (done || chunk == null) return;
    buf += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      block[key] = val;
      if (key === "progress") { emit(); if (done) return; }
    }
  };
}

function overallPct(stagesMap, currentStage, stagePct) {
  const total = Object.values(STAGE_WEIGHTS).reduce((a, b) => a + b, 0);
  const stages = stagesMap && typeof stagesMap === "object" ? stagesMap : {};
  let got = 0;
  for (const [name, w] of Object.entries(STAGE_WEIGHTS)) {
    const st = stages[name] && stages[name].status;
    if (name === currentStage) continue;
    if (st === "done" || st === "skipped") got += w;
  }
  if (currentStage && STAGE_WEIGHTS[currentStage]) {
    const p = Number(stagePct);
    const st = stages[currentStage] && stages[currentStage].status;
    const frac = st === "done" || st === "skipped" ? 1 : (Number.isFinite(p) ? clamp(p, 0, 100) / 100 : 0);
    got += STAGE_WEIGHTS[currentStage] * frac;
  }
  return Math.round(clamp((got / total) * 100, 0, 100) * 10) / 10;
}

// Base cost model per stage, seconds: a + b·D (·px·cf when cpuBound). Deliberately rough — the
// EWMA ratio corrects it to this host after a few runs.
const BASE_MODEL = Object.freeze({
  VALIDATING: { a: 3, b: 0.05, cpu: true }, COMPRESSING: { a: 5, b: 0.8, cpu: true },
  EXTRACTING_AUDIO: { a: 2, b: 0.05, cpu: true }, TRANSCRIBING: { a: 10, b: 0.5, cpu: false },
  ANALYZING_VIDEO: { a: 20, b: 0.4, cpu: true }, ANALYZING_CONTENT: { a: 25, b: 0.3, cpu: false },
  SEARCHING_BROLL: { a: 15, b: 0.1, cpu: false }, SCORING_ASSETS: { a: 20, b: 0.3, cpu: false },
  BUILDING_EDIT_PLAN: { a: 30, b: 0.3, cpu: false }, PREPARING_RENDER: { a: 10, b: 0.2, cpu: true },
  RENDERING: { a: 10, b: 1.5, cpu: true }, POST_PROCESSING: { a: 5, b: 0.15, cpu: true },
  QUALITY_CHECK: { a: 15, b: 0.3, cpu: true },
});
const ALPHA = 0.3;

function createEtaModel({ settings = null, file = null } = {}) {
  const metricsFile = file || (settings && settings.paths ? path.join(settings.paths.metricsDir, "stage-rates.json") : null);
  const rates = {};
  if (metricsFile) {
    const r = fsx.readJsonSafe(metricsFile);
    const stored = r.ok && r.value && typeof r.value.stages === "object" ? r.value.stages : {};
    for (const s of STAGES) {
      const v = stored[s];
      if (v && Number.isFinite(v.ratio) && v.ratio > 0) rates[s] = { ratio: clamp(v.ratio, 0.1, 10), n: Number.isInteger(v.n) ? v.n : 1, updatedAt: v.updatedAt || 0 };
    }
  }
  let dirty = false;

  function estimate(stage, { durationSec = 30, pixels = 2.07e6, cpus } = {}) {
    const m = BASE_MODEL[stage];
    if (!m) return 0;
    const D = Math.max(0, Number(durationSec) || 0);
    const px = Math.max(1, (Number(pixels) || 0) / 2.07e6);
    const c = Number(cpus) > 0 ? Number(cpus) : ((settings && settings.cpus) || 2);
    const cf = Math.max(0.5, 4 / c);
    const base = m.cpu ? m.a + m.b * D * px * cf : m.a + m.b * D;
    const ratio = rates[stage] ? rates[stage].ratio : 1;
    return Math.round(base * ratio * 10) / 10;
  }

  function remaining(stage, { stagePct = 0, elapsedMs = 0, ...rest } = {}) {
    const total = estimate(stage, rest);
    const p = clamp(Number(stagePct) || 0, 0, 100) / 100;
    const model = total * (1 - p);
    if (p > 0.05 && elapsedMs > 0) {
      const observed = (elapsedMs / 1000) * (1 - p) / p;
      return Math.max(0, Math.round((0.5 * model + 0.5 * observed) * 10) / 10);
    }
    return Math.max(0, Math.round(model * 10) / 10);
  }

  function record(stage, actualMs, predictedMs) {
    if (!BASE_MODEL[stage] || !(actualMs > 0) || !(predictedMs > 0)) return null;
    const sample = clamp(actualMs / predictedMs, 0.1, 10);
    const prev = rates[stage];
    const ratio = prev ? clamp(prev.ratio * (1 - ALPHA) + sample * ALPHA, 0.1, 10) : clamp(1 * (1 - ALPHA) + sample * ALPHA, 0.1, 10);
    rates[stage] = { ratio, n: (prev ? prev.n : 0) + 1, updatedAt: Date.now() };
    dirty = true;
    return ratio;
  }

  function save() {
    if (!dirty || !metricsFile) return false;
    try {
      fsx.ensureDir(path.dirname(metricsFile));
      fsx.writeJsonAtomic(metricsFile, { schemaVersion: 1, alpha: ALPHA, stages: rates });
      dirty = false;
      return true;
    } catch { return false; }
  }

  function ratios() { return JSON.parse(JSON.stringify(rates)); }

  return { estimate, remaining, record, save, ratios };
}

module.exports = { createProgressParser, STAGE_WEIGHTS, overallPct, createEtaModel, BASE_MODEL };
