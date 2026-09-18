// VIDEO EDIT PHASE-5 STAGE HANDLERS — SEARCHING_BROLL and SCORING_ASSETS.
//
// WHY THIS EXISTS. B-roll is the one part of the pipeline that spends other people's quota (Pexels,
// Pixabay, Openverse) and a vision model's budget, so it runs exactly once per analysis, before the
// director, over a slot set that already covers every intensity (ANALYSIS.md §8):
//   SEARCHING_BROLL  content + transcript + faces → broll/slots.js `analysis/broll_slots.json` → broll/search.js
//                    per slot → `analysis/broll_raw/<slotId>.json` and a manifest `analysis/broll_search.json`
//                    whose per-slot item hashes feed the next stage's input hash (a re-search that returns
//                    different hits re-scores; an identical one is skipped).
//   SCORING_ASSETS   raw hits → prior → thumbnails → dHash → contact sheets → ve_broll_judge → totals →
//                    `broll/candidates/<slotId>.json` + `analysis/broll_scored.json` (broll/score.js), plus a
//                    per-call judge cost ledger `analysis/broll_judge_ledger.json`.
// Both stages fail OPEN (ENGINE.md §6): a provider that is down, a rejected key or an empty page is a
// notice (STOCK_PROVIDER_DOWN, NO_BROLL_FOUND), never a thrown error; a judge that fails, is over the
// project cost cap, or has no vision consent degrades scoring to lexical + technical
// (BROLL_JUDGE_UNAVAILABLE, `judge:'unavailable'`). A transient throw gets the runner's retries; anything
// else that escapes the broll modules is caught and turned into an empty B-roll result with notice
// BROLL_UNAVAILABLE, so B-roll can never park or fail the project. Only cancellation propagates.
//
// Input hashing: SEARCHING_BROLL hashes what changes the SEARCH — transcript + content + video-analysis
// output shas, output ASPECT (not the export size), language, broll.enabled/allowImages, the retrieval
// config (provider order), which provider keys are configured, and the intensity-independent slot budget.
// `broll.intensity` is deliberately absent: slots are capped at the HIGH budget so an intensity change
// never refetches. SCORING_ASSETS hashes the search outputs plus everything scoring reads (intensity,
// full output geometry, palette, vision consent, scoring config).
//
// Faults (ENGINE.md §8): `assets:http500|empty|keyRejected` fire inside broll/search.js per provider call;
// `llm:*` and the B-roll-only `judge:error|invalid_json|budget|timeout|429` fire inside broll/judge.js
// through the facade built here (faults.js has no `judge` area, so those tokens are read from the same
// VIDEO_EDIT_FAULTS / settings.debugFaults strings, gated by faultsAllowed).
//
// CONTRACT:
//   stages(deps) -> [SEARCHING_BROLL def, SCORING_ASSETS def]
//   register(registry = stages.defaultRegistry, deps) -> registry      (runner: handlers:[register] or [(r) => register(r, deps)])
//   deps = { fetch?, callJson?, keys?:{pexels,pixabay}, cache?, searchConcurrency?=2 }  — tests inject; production
//          uses the global fetch, ai/llm.callJson, config keys and the shared search cache.
//   outputGeometry(project) -> { aspect:'9:16'|'16:9'|'1:1', width, height }   (export profile long edge)
//   languageOf(project, transcript, words) -> ISO code · judgeBlockedReason(ctx) -> 'cost_cap' | null
//   judgeFaultMode(ctx) -> 'error'|'invalid_json'|'budget'|'timeout'|'429'|null · judgeFaults(ctx) -> { maybeFail, faultFor }
//   SEARCH_REL · SLOTS_REL · LEDGER_REL · CONTENT_REL · TRANSCRIPT_REL · WORDS_REL · FACES_REL

const fsx = require("../../fsx");
const faultsModule = require("../../faults");
const stagesModule = require("../stages");
const { EditError, isEditError } = require("../../errors");

const SLOTS_VERSION = 2;
const SCORE_VERSION = 2;
const CONTENT_REL = "analysis/content.json";
const TRANSCRIPT_REL = "analysis/transcript.json";
const WORDS_REL = "analysis/transcript.words.json";
const FACES_REL = "analysis/faces.json";
const SLOTS_REL = "analysis/broll_slots.json";
const SEARCH_REL = "analysis/broll_search.json";
const LEDGER_REL = "analysis/broll_judge_ledger.json";
const LLM_CACHE_REL = "analysis/llm-cache";
const PROFILE_LONG_EDGE = Object.freeze({ export1080: 1920, export720: 1280 });
const ASPECTS = Object.freeze(["9:16", "16:9", "1:1"]);
const LANGS = Object.freeze(["en", "hi", "es", "fr", "de", "pt", "ar", "ja"]);
const PROVIDER_LABELS = Object.freeze({ pexels: "Pexels", pixabay: "Pixabay", openverse: "Openverse" });
const DOWN_STATUSES = new Set(["error", "breaker_open", "rate_limited", "key_rejected"]);
const JUDGE_FAULT_RE = /^judge:(error|invalid_json|budget|timeout|429)$/;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v) => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function mods() {
  return {
    slots: require("../../broll/slots"),
    search: require("../../broll/search"),
    score: require("../../broll/score"),
    retrieval: require("../../broll/defaults"),
    scoring: require("../../broll/score_defaults"),
  };
}

function stageDone(project, name) {
  const r = project && isPlain(project.stages) ? project.stages[name] : null;
  return !!(r && (r.status === "done" || r.status === "skipped"));
}

function sourceDims(project) {
  const p = isPlain(project) ? project : {};
  const src = isPlain(p.source) ? p.source : {};
  const mz = isPlain(src.mezzanine) ? src.mezzanine : {};
  const v = isPlain(src.video) ? src.video : {};
  const d = isPlain(p.discoveries) ? p.discoveries : {};
  const w = num(mz.width) || num(v.displayWidth) || num(v.width) || num(d.width);
  const h = num(mz.height) || num(v.displayHeight) || num(v.height) || num(d.height);
  return w > 0 && h > 0 ? { w, h } : null;
}

function outputGeometry(project) {
  const s = project && isPlain(project.settings) ? project.settings : {};
  let aspect = isPlain(s.output) && ASPECTS.includes(s.output.aspect) ? s.output.aspect : null;
  if (!aspect) {
    const dims = sourceDims(project);
    if (!dims) aspect = "9:16";
    else {
      const r = dims.w / dims.h;
      aspect = Math.abs(r - 1) <= 0.05 ? "1:1" : (r > 1 ? "16:9" : "9:16");
    }
  }
  const long = PROFILE_LONG_EDGE[s.exportProfile] || PROFILE_LONG_EDGE.export1080;
  const short = Math.round((long * 9) / 16 / 2) * 2;
  if (aspect === "16:9") return { aspect, width: long, height: short };
  if (aspect === "1:1") return { aspect, width: short, height: short };
  return { aspect, width: short, height: long };
}

function languageOf(project, transcript, words) {
  const forced = project && isPlain(project.settings) ? project.settings.language : null;
  if (typeof forced === "string" && LANGS.includes(forced)) return forced;
  for (const v of [transcript && transcript.language, words && words.language]) {
    if (typeof v === "string" && /^[a-z]{2}/i.test(v)) return v.slice(0, 2).toLowerCase();
  }
  return "en";
}

function durationFor(ctx) {
  const p = ctx.project || {};
  return num(p.source && p.source.durationSec) || num(p.discoveries && p.discoveries.durationSec) || 300;
}

function judgeBlockedReason(ctx) {
  const p = ctx.project || {};
  const cost = isPlain(p.cost) ? p.cost : {};
  const spent = num(cost.spentUsd) || 0;
  const caps = ctx.settings && isPlain(ctx.settings.caps) ? ctx.settings.caps : {};
  const cap = num(p.settings && p.settings.maxCostUsd) || (num(cost.capUsd) > 0 ? num(cost.capUsd) : null) || num(caps.maxUsdPerProject);
  return cap > 0 && spent >= cap - 1e-9 ? "cost_cap" : null;
}

const withoutBroll = (ctx) => Array.isArray(ctx.continueWithout) && ctx.continueWithout.includes("broll");

// ---- judge fault facade ------------------------------------------------------------------------------
function judgeFaultMode(ctx) {
  const settings = ctx && ctx.settings;
  if (!faultsModule.faultsAllowed(settings)) return null;
  const p = (ctx && ctx.project) || {};
  const layers = [
    settings && settings.faults ? settings.faults.global : null,
    (isPlain(p.settings) && p.settings.debugFaults) || p.debugFaults || null,
  ];
  let mode = null;
  for (const layer of layers) {
    if (typeof layer !== "string") continue;
    for (const raw of layer.split(",")) {
      const m = JUDGE_FAULT_RE.exec(raw.trim());
      if (m) mode = m[1];
    }
  }
  return mode;
}

function judgeFaultError(mode) {
  const detail = "fault-injected";
  const extra = { provider: "openrouter" };
  if (mode === "budget") return new EditError("LLM_CALL_FAILED", { errorClass: "budget", retryable: false, detail, extra: { ...extra, httpStatus: 402 } });
  if (mode === "timeout") return new EditError("LLM_CALL_FAILED", { errorClass: "transient", retryable: true, detail, extra });
  if (mode === "429") return new EditError("LLM_CALL_FAILED", { errorClass: "transient", retryable: true, detail, extra: { ...extra, httpStatus: 429 } });
  return new EditError("LLM_CALL_FAILED", { errorClass: "provider", retryable: true, detail, extra });
}

function judgeFaults(ctx) {
  const base = ctx && isPlain(ctx.faults) ? ctx.faults : null;
  const mode = judgeFaultMode(ctx);
  return {
    faultFor(point, extra) {
      if (point === "llm" && mode) return { mode: mode === "invalid_json" ? "invalid_json" : mode, arg: null };
      return base && typeof base.faultFor === "function" ? base.faultFor(point, extra) : null;
    },
    async maybeFail(point, extra) {
      if (point === "llm" && mode) {
        if (mode === "invalid_json") return; // judge.js shapes it into LLM_INVALID_JSON itself
        throw judgeFaultError(mode);
      }
      if (base && typeof base.maybeFail === "function") await base.maybeFail(point, extra);
    },
  };
}

// ---- helpers ---------------------------------------------------------------------------------------
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(Math.floor(limit) || 1, items.length)) }, worker));
  return out;
}

const noticeOf = (n) => ({ code: n.code, severity: n.severity === "warn" ? "warn" : "info", message: n.message || null, ...(n.provider ? { provider: n.provider } : {}) });

function isCancel(e, signal) {
  return (signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled");
}

// Transient throws go back to the runner (≤ 3 attempts); the last attempt, and every other class, degrades.
function shouldRethrow(e, ctx) {
  if (isCancel(e, ctx.signal)) return true;
  return isEditError(e) && e.errorClass === "transient" && (Number(ctx.attempt) || 1) < 3;
}

function configuredProviders(keys, searchModule) {
  let k = { pexels: "", pixabay: "" };
  try { k = searchModule.resolveKeys(keys); } catch { /* unconfigured */ }
  return { pexels: !!k.pexels, pixabay: !!k.pixabay, openverse: true };
}

// Per-provider worst state across every slot search → one STOCK_PROVIDER_DOWN notice naming them.
function providerNotices(results) {
  const status = new Map();
  let unconfigured = null;
  for (const r of results) {
    for (const [p, st] of Object.entries((r && r.providers) || {})) {
      if (!st) continue;
      if (st.status === "ok") status.set(p, "ok");
      else if (DOWN_STATUSES.has(st.status) && status.get(p) !== "ok") status.set(p, st.status);
      else if (st.status === "unconfigured" && !status.has(p)) status.set(p, "unconfigured");
    }
  }
  const down = [...status.entries()].filter(([, s]) => DOWN_STATUSES.has(s));
  const notices = [];
  if (down.length) {
    const names = down.map(([p]) => PROVIDER_LABELS[p] || p);
    const rejected = down.some(([, s]) => s === "key_rejected");
    notices.push({
      code: "STOCK_PROVIDER_DOWN", severity: "info", providers: down.map(([p, s]) => ({ provider: p, status: s })),
      message: `${names.join(", ")} ${names.length > 1 ? "were" : "was"} unavailable${rejected ? " (API key rejected)" : ""}; other stock sources were searched.`,
    });
  }
  unconfigured = [...status.entries()].filter(([, s]) => s === "unconfigured").map(([p]) => PROVIDER_LABELS[p] || p);
  if (unconfigured.length) {
    notices.push({ code: "BROLL_PROVIDER_UNCONFIGURED", severity: "info", message: `${unconfigured.join(", ")} not configured; other stock sources were searched.` });
  }
  return { notices, down: down.map(([p]) => p) };
}

// ---- stages ----------------------------------------------------------------------------------------
function stages(deps = {}) {
  const d = isPlain(deps) ? deps : {};

  const SEARCHING_BROLL = {
    name: "SEARCHING_BROLL",
    version: SLOTS_VERSION,
    deps: ["ANALYZING_CONTENT", "ANALYZING_VIDEO"],
    heavy: false,
    weight: 5,
    inputHash(ctx) {
      const m = mods();
      const p = ctx.project || {};
      const s = isPlain(p.settings) ? p.settings : {};
      const broll = isPlain(s.broll) ? s.broll : {};
      const scoring = m.scoring.resolveScoringSettings(ctx.settings);
      return {
        upstream: stagesModule.upstreamFingerprint(p, ["TRANSCRIBING", "ANALYZING_CONTENT", "ANALYZING_VIDEO"]),
        broll: { enabled: broll.enabled !== false && !withoutBroll(ctx), allowImages: broll.allowImages !== false },
        language: s.language || null,
        aspect: outputGeometry(p).aspect,
        providers: configuredProviders(d.keys, m.search),
        retrieval: fsx.sha256Json(m.retrieval.resolveRetrievalSettings(ctx.settings)),
        slots: fsx.sha256Json({ slots: scoring.slots, rhythmHigh: scoring.rhythmHigh }),
      };
    },
    budgetMs(ctx) {
      const cap = mods().slots.capFor(durationFor(ctx));
      return Math.min(20 * 60, Math.max(120, 30 + 20 * cap * 3)) * 1000; // ENGINE.md §5.2: 20 s per query
    },
    async run(ctx) {
      const m = mods();
      const p = ctx.project || {};
      const output = outputGeometry(p);
      const transcript = ctx.readJson(TRANSCRIPT_REL);
      const words = ctx.readJson(WORDS_REL);
      const lang = languageOf(p, transcript, words);
      ctx.progress(2, "Finding B-roll");
      try {
        const content = ctx.readJson(CONTENT_REL);
        const faces = stageDone(p, "ANALYZING_VIDEO") ? ctx.readJson(FACES_REL) : null;
        const projectSettings = isPlain(p.settings) ? p.settings : {};
        const effective = withoutBroll(ctx)
          ? { ...projectSettings, broll: { ...(isPlain(projectSettings.broll) ? projectSettings.broll : {}), enabled: false } }
          : projectSettings;
        const built = m.slots.buildSlots({
          content: isPlain(content) ? content : null,
          sentences: isPlain(transcript) && Array.isArray(transcript.sentences) ? transcript.sentences : [],
          words: isPlain(words) && Array.isArray(words.words) ? words.words : [],
          faces: isPlain(faces) ? faces : null,
          settings: effective, output: null, transcript: isPlain(transcript) ? transcript : null, lang, serverSettings: ctx.settings,
        });
        await ctx.writeJson(m.slots.SLOTS_REL, { ...built, output });
        ctx.progress(5, "Finding B-roll");

        let done = 0;
        const results = await mapLimit(built.slots, d.searchConcurrency || 2, async (slot) => {
          const r = await m.search.searchSlot({
            slot, output, settings: ctx.settings, signal: ctx.signal, fetch: d.fetch || null, tracker: ctx.tracker,
            keys: d.keys, cache: d.cache, project: p, writeJson: ctx.writeJson, log: ctx.log,
          });
          done++;
          ctx.progress(5 + (95 * done) / built.slots.length, "Finding B-roll");
          return r;
        });

        const items = results.reduce((a, r) => a + r.items.length, 0);
        const prov = providerNotices(results);
        const notices = [...prov.notices];
        if (built.slots.length && items === 0) {
          notices.push({ code: "NO_BROLL_FOUND", severity: "warn", message: "No stock footage was found; the edit uses your footage only." });
        }
        await ctx.writeJson(SEARCH_REL, {
          schemaVersion: 1, stage: "SEARCHING_BROLL", lang, output: { aspect: output.aspect },
          counts: { slots: built.slots.length, withCandidates: results.filter((r) => r.items.length).length, items, excluded: built.excluded.length },
          providersDown: prov.down,
          slots: results.map((r) => ({
            slotId: r.slotId, sentenceId: r.sentenceId, path: r.path, items: r.items.length, itemsHash: fsx.sha256Json(r.items),
            kinds: r.kinds, fallbackUsed: r.fallbackUsed, skipped: r.skipped,
            providers: Object.fromEntries(Object.entries(r.providers || {}).map(([k, v]) => [k, v && v.status])),
          })),
        });
        const fallbacks = [];
        if (results.some((r) => r.fallbackUsed)) fallbacks.push("image_fallback");
        if (prov.down.length) fallbacks.push(`providers_down:${prov.down.join("+")}`);
        return {
          outputs: { slots: { path: m.slots.SLOTS_REL }, search: { path: SEARCH_REL } },
          engine: built.slots.length ? "stock" : "none",
          fallbacks,
          discoveries: { brollSlots: built.slots.length, brollCandidates: items },
          notices: notices.map(noticeOf),
        };
      } catch (e) {
        if (shouldRethrow(e, ctx)) throw e;
        const code = isEditError(e) ? e.code : "INTERNAL";
        ctx.log.warn(`[video-edit] SEARCHING_BROLL degraded code=${code}`);
        await ctx.writeJson(SLOTS_REL, { schemaVersion: 1, source: "error", lang, enabled: false, cap: 0, slots: [], excluded: [], output, error: code });
        await ctx.writeJson(SEARCH_REL, {
          schemaVersion: 1, stage: "SEARCHING_BROLL", lang, output: { aspect: output.aspect }, degraded: code,
          counts: { slots: 0, withCandidates: 0, items: 0, excluded: 0 }, providersDown: [], slots: [],
        });
        return {
          outputs: { slots: { path: SLOTS_REL }, search: { path: SEARCH_REL } },
          engine: "none", fallbacks: [`error:${code}`],
          discoveries: { brollSlots: 0, brollCandidates: 0 },
          notices: [{ code: "BROLL_UNAVAILABLE", severity: "warn", message: "B-roll search failed; the edit uses your footage only." }],
        };
      }
    },
  };

  const SCORING_ASSETS = {
    name: "SCORING_ASSETS",
    version: SCORE_VERSION,
    deps: ["SEARCHING_BROLL"],
    heavy: false,
    weight: 6,
    inputHash(ctx) {
      const m = mods();
      const p = ctx.project || {};
      const s = isPlain(p.settings) ? p.settings : {};
      const broll = isPlain(s.broll) ? s.broll : {};
      const pal = isPlain(s.brand) && isPlain(s.brand.palette) ? s.brand.palette : null;
      return {
        upstream: stagesModule.upstreamFingerprint(p, ["SEARCHING_BROLL"]),
        broll: { intensity: broll.intensity || null, allowImages: broll.allowImages !== false },
        allowCloudVision: !(isPlain(s.privacy) && s.privacy.allowCloudVision === false),
        palette: pal ? [pal.primary || null, pal.secondary || null] : null,
        output: outputGeometry(p),
        scoring: fsx.sha256Json(m.scoring.resolveScoringSettings(ctx.settings)),
      };
    },
    budgetMs(ctx) {
      const doc = ctx.readJson(SLOTS_REL);
      const n = isPlain(doc) && Array.isArray(doc.slots) ? doc.slots.length : mods().slots.capFor(durationFor(ctx));
      const calls = Math.ceil(n / 3);
      return Math.min(45 * 60, 60 + 2 * 90 * calls + 20 * n) * 1000; // 2×: a batch may escalate once
    },
    async run(ctx) {
      const m = mods();
      const p = ctx.project || {};
      const doc = ctx.readJson(m.slots.SLOTS_REL);
      if (!isPlain(doc) || !Array.isArray(doc.slots)) {
        throw new EditError("BROLL_SLOTS_MISSING", { status: 409, errorClass: "bug", retryable: false, stage: "SCORING_ASSETS", detail: "broll_slots.json missing" });
      }
      const blocked = judgeBlockedReason(ctx);
      const output = outputGeometry(p);
      const ledger = [];
      const baseCall = d.callJson || null;
      const callJson = async (opts) => {
        const call = baseCall || require("../../ai/llm").callJson;
        const onCost = (entry) => {
          ledger.push({
            stage: entry.stage, model: entry.model || null, attempt: entry.attempt || 1,
            costUsd: Number(entry.costUsd) || 0, tokensIn: Number(entry.tokensIn) || 0, tokensOut: Number(entry.tokensOut) || 0,
          });
          if (typeof opts.onCost === "function") { try { opts.onCost(entry); } catch { /* noop */ } }
        };
        const before = ledger.length;
        const res = await call({ ...opts, onCost });
        // A transport that never reports per-attempt costs (an injected judge, a cache hit) is recorded from its result.
        if (ledger.length === before && res) {
          ledger.push({ stage: opts.stage, model: res.model || opts.model || null, attempt: 1, costUsd: Number(res.costUsd) || 0,
            tokensIn: Number(res.tokensIn) || 0, tokensOut: Number(res.tokensOut) || 0, cached: !!res.cached });
        }
        return res;
      };
      const writeLedger = async (costUsd) => {
        await ctx.writeJson(LEDGER_REL, {
          schemaVersion: 1, stage: "SCORING_ASSETS", runId: ctx.runId || null,
          totalUsd: Math.round((Number(costUsd) || 0) * 1e8) / 1e8,
          calls: ledger.length, entries: ledger.slice(0, 200),
        });
      };
      try {
        const res = await m.score.scoreSlots({
          slots: doc.slots,
          candidatesBySlot: m.score.readRawCandidates(ctx.projectDir, doc.slots),
          projectDir: ctx.projectDir,
          output,
          projectSettings: isPlain(p.settings) ? p.settings : {},
          lang: typeof doc.lang === "string" ? doc.lang : "en",
          fetch: d.fetch || null, callJson, signal: ctx.signal, tracker: ctx.tracker, settings: ctx.settings,
          writeJson: ctx.writeJson, cacheDir: ctx.abs(LLM_CACHE_REL), onProgress: (pct, msg) => ctx.progress(pct, msg),
          log: ctx.log, faults: judgeFaults(ctx), pidFile: ctx.pidFile, judgeBlockedReason: blocked,
        });
        await writeLedger(res.costUsd);
        const outputs = { scored: { path: m.score.SCORED_REL } };
        Object.values(res.files.candidates).forEach((rel, i) => { outputs[`cand_${i}`] = { path: rel }; });
        const judged = doc.slots.length > 0;
        return {
          outputs,
          engine: !judged ? "none" : (res.judge === "ok" ? "judge" : (res.judge === "partial" ? "judge_partial" : "lexical")),
          fallbacks: judged && res.judge !== "ok" ? [blocked ? `judge_${blocked}` : "judge_unavailable"] : [],
          discoveries: { ...res.discoveries, brollAccepted: res.summary.counts.accepted, brollScoredSlots: res.summary.counts.slots },
          notices: res.notices.map(noticeOf),
          costUsd: res.costUsd,
        };
      } catch (e) {
        if (shouldRethrow(e, ctx)) throw e;
        const code = isEditError(e) ? e.code : "INTERNAL";
        ctx.log.warn(`[video-edit] SCORING_ASSETS degraded code=${code}`);
        const spent = ledger.reduce((a, x) => a + x.costUsd, 0);
        await writeLedger(spent);
        const slots = doc.slots.map((s) => ({
          slotId: s.slotId, sentenceId: s.sentenceId, accepted: false, acceptedByIntensity: { low: false, medium: false, high: false },
          judge: "unavailable", judgeReason: "scoring_failed", mediaPreference: s.mediaPreference || "video", mediaTypes: [],
          bestTotal: null, best: null, top: [], needsImages: false, candidateCount: 0,
        }));
        await ctx.writeJson(m.score.SCORED_REL, {
          schemaVersion: 1, scoredAt: Date.now(), degraded: code, judge: "unavailable", judgeReason: "scoring_failed", judgeModels: [],
          costUsd: spent, counts: { slots: slots.length, accepted: 0, acceptedAnyIntensity: 0 }, slots,
        });
        return {
          outputs: { scored: { path: m.score.SCORED_REL } },
          engine: "none", fallbacks: [`error:${code}`],
          discoveries: { brollMoments: 0, brollAccepted: 0, brollScoredSlots: slots.length },
          notices: slots.length
            ? [{ code: "BROLL_UNAVAILABLE", severity: "warn", message: "B-roll could not be scored; the edit uses your footage only." },
              { code: "NO_BROLL_FOUND", severity: "warn", message: "Edit uses your footage only." }]
            : [],
          costUsd: spent,
        };
      }
    },
  };

  return [SEARCHING_BROLL, SCORING_ASSETS];
}

function register(registry = stagesModule.defaultRegistry, deps = {}) {
  for (const def of stages(deps)) registry.registerStage(def);
  return registry;
}

module.exports = {
  stages, register, outputGeometry, languageOf, judgeBlockedReason, judgeFaultMode, judgeFaults, providerNotices,
  SEARCH_REL, SLOTS_REL, LEDGER_REL, CONTENT_REL, TRANSCRIPT_REL, WORDS_REL, FACES_REL, SLOTS_VERSION, SCORE_VERSION,
};
