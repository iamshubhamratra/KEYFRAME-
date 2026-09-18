// VIDEO EDIT OPS ENGINE — apply a batch of user edits to an Edit Plan (EDIT_PLAN.md §5).
//
// WHY THIS EXISTS. Every change a person makes after the AI's first cut — a caption typo, a removed
// B-roll, a restored filler, a new aspect — arrives as an op. The plan is the single source of truth,
// so a half-applied batch would leave a revision nobody asked for, and an op validated against a stale
// view would target the wrong cue. This engine gives batches all-or-nothing semantics: clone the plan,
// validate and apply each op against the evolving draft (reading derived cues / time maps from a lazily
// re-resolved view when an earlier op changed them), resolve once, validate the whole plan with the
// zod contract, and only then return it. Any failure is a 422 INVALID_OP naming the op index and a
// human reason, and the caller's plan is untouched. It is pure: no I/O (ops that need the network emit
// costEvents instead), no clock (ctx.now), no RNG (ids derive from projectId|revision|batchId|index).
//
// CONTRACT:
//   applyOps(plan, ops, ctx) -> { plan, warnings, invalidates:{ level, ranges:[[outIn,outOut]] }, costEvents,
//                                 applied, projectPatch }
//     ops: ≤ 100 of { type, ...payload } or { type, payload:{…} }.
//     ctx: { now (required), words, sentences?, envelope?, faces?, mezz?, scenes?, emphasis?, content?,
//            batchId?, author?:'user'|'qa-repair', candidates?, assets?, selectEdits? }
//     warnings: [{ code, index, … }]  e.g. NOOP, PIP_MOVED, VOLUME_CLAMPED, REPLANNED, TRANSLATION_PENDING
//     costEvents: [{ code:'NEEDS_FETCH'|'NEEDS_AI'|'RERANK_BROLL', index, job, elementId, net:'fetch'|'ai'|'none', … }]
//     invalidates.level = max over ops of NONE < AUDIO < COMPOSITE < BASE < SHIFT; ranges merged, output seconds,
//       elements measured in the input plan AND the result (old ∪ new); SHIFT ranges run to the end. Whatever the
//       per-op table says, a changed timeline.mapHash raises the level to SHIFT from the first differing piece.
//     provenance.ops += { opId, at: ctx.now, type, elementIds, batchId } per op (last 2000 kept).
//     Throws EditError INVALID_OP 422 extra { index, reason }; bugs propagate unchanged.
//   OP_TYPES · HANDLERS · computeInvalidation(before, after, results) · parseEnvelope(op)

const { EditError } = require("../errors");
const T = require("./timeline");
const { resolvePlan } = require("./resolve");
const { parsePlan, collectIds } = require("./schema");
const U = require("./ops_util");

const HANDLERS = Object.freeze({
  ...require("./ops_captions").HANDLERS,
  ...require("./ops_cuts").HANDLERS,
  ...require("./ops_broll").HANDLERS,
  ...require("./ops_misc").HANDLERS,
});
const OP_TYPES = Object.freeze(Object.keys(HANDLERS).sort());
const MAX_OPS = 100;
const PROVENANCE_OPS_CAP = 2000;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function parseEnvelope(op) {
  if (!isPlain(op) || typeof op.type !== "string" || !op.type) U.reject("each op needs a string `type`");
  const { type, ...rest } = op;
  if (Object.prototype.hasOwnProperty.call(rest, "payload")) {
    if (Object.keys(rest).length !== 1 || !isPlain(rest.payload)) U.reject("use either { type, payload } or a flat op, not both");
    return { type, payload: rest.payload };
  }
  return { type, payload: rest };
}

function formatZod(error) {
  return error.issues.slice(0, 3).map((i) => `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`).join("; ");
}

function toInvalid(e, index) {
  if (e && e.name === "OpRejection") return U.invalidOp(index, e.reason, e.extra);
  if (e && e.name === "EditError" && e.status >= 400 && e.status < 500) {
    return U.invalidOp(index, (e.extra && e.extra.reason) || e.detail || e.code);
  }
  return e;
}

function resolveCtx(ctx) {
  return { words: ctx.words, sentences: ctx.sentences, envelope: ctx.envelope, faces: ctx.faces, mezz: ctx.mezz, scenes: ctx.scenes, emphasis: ctx.emphasis, now: ctx.now };
}

function runBatch(plan, ops, ctx, count) {
  const words = Array.isArray(ctx.words) ? ctx.words : [];
  const seed = `${plan.projectId}|${plan.revision}|${ctx.batchId == null ? "" : ctx.batchId}`;
  const state = { draft: U.clone(plan), derived: null, map: null };
  const warnings = [], costEvents = [], results = [];
  const projectPatch = {};
  let mintCounter = 0;
  const env = {
    get draft() { return state.draft; },
    setDraft(p) { state.draft = U.clone(p); state.derived = null; state.map = null; },
    derived() {
      if (!state.derived) {
        try { state.derived = resolvePlan(state.draft, resolveCtx(ctx)); }
        catch (e) { if (e && e.name === "EditError" && e.status < 500) U.reject(e.detail || e.code); throw e; }
      }
      return state.derived;
    },
    timeMap() { if (!state.map) state.map = T.buildTimeMap(env.derived().timeline.pieces); return state.map; },
    words, ctx, now: ctx.now, index: 0, isRepair: ctx.author === "qa-repair", projectPatch,
    warn(code, extra = {}) { const { code: _c, index: _i, ...rest } = extra || {}; warnings.push({ code, index: env.index, ...rest }); },
    cost(ev) { costEvents.push({ index: env.index, ...ev }); },
    newId(prefix) {
      const taken = new Set(collectIds(state.draft).map((x) => x.id));
      let id;
      do { id = `${prefix}_u${U.hashHex(`${seed}|${env.index}|${prefix}|${mintCounter++}`, 10)}`; } while (taken.has(id));
      return id;
    },
  };

  for (let i = 0; i < count; i++) {
    env.index = i;
    let res, type;
    try {
      const env0 = parseEnvelope(ops[i]);
      type = env0.type;
      const h = HANDLERS[type];
      if (!h) U.reject(`unknown op type '${type}'`);
      const parsed = h.schema.safeParse(env0.payload);
      if (!parsed.success) U.reject(`${type}: ${formatZod(parsed.error)}`);
      res = h.apply(env, parsed.data);
    } catch (e) { throw toInvalid(e, i); }
    state.derived = null;
    state.map = null;
    const elementIds = [...new Set((res.elementIds || []).map(String))].filter((id) => id.length > 0 && id.length <= 48).slice(0, 500);
    results.push({ index: i, type, level: res.level, targets: res.targets || [], elementIds });
    const prov = state.draft.provenance;
    prov.ops.push({ opId: `op_${U.hashHex(`${seed}|op|${i}`, 12)}`, at: ctx.now, type, elementIds, batchId: ctx.batchId == null ? null : String(ctx.batchId).slice(0, 80) });
    if (prov.ops.length > PROVENANCE_OPS_CAP) prov.ops = prov.ops.slice(-PROVENANCE_OPS_CAP);
  }
  return { draft: state.draft, warnings, costEvents, results, projectPatch };
}

function finalize(draft, ctx, words) {
  const after = resolvePlan(draft, resolveCtx(ctx));
  return { after, check: parsePlan(after, { wordCount: words.length }) };
}

function locateFailure(plan, ops, ctx, words) {
  for (let k = 0; k < ops.length; k++) {
    try {
      const run = runBatch(plan, ops, ctx, k + 1);
      if (!finalize(run.draft, ctx, words).check.ok) return k;
    } catch { return k; }
  }
  return ops.length - 1;
}

// ---------------------------------------------------------------- invalidation
function spansOf(plan, id, fallbackKeys) {
  if (!plan) return [];
  const out = [];
  const pools = [plan.aRoll && plan.aRoll.segments, plan.broll, plan.graphics, plan.effects, plan.captions && plan.captions.cues];
  for (const pool of pools) {
    for (const el of pool || []) {
      if (el.id === id && el.resolved) out.push([el.resolved.outIn, el.resolved.outOut]);
    }
  }
  for (const s of plan.sfx || []) if (s.id === id && s.resolved) out.push([s.resolved.outAt, s.resolved.outAt + 0.5]);
  if (!out.length && fallbackKeys && fallbackKeys.size) {
    for (const c of (plan.captions && plan.captions.cues) || []) {
      if (c.resolved && c.words.some((w) => fallbackKeys.has(w.key))) out.push([c.resolved.outIn, c.resolved.outOut]);
    }
  }
  return out;
}

function computeInvalidation(before, after, results) {
  const beforePieces = before && before.timeline && Array.isArray(before.timeline.pieces) ? before.timeline.pieces : [];
  const beforeMap = beforePieces.length ? T.buildTimeMap(beforePieces) : null;
  const afterMap = T.buildTimeMap(after.timeline.pieces);
  const dur = Math.max(before && before.timeline ? before.timeline.outDurationSec || 0 : 0, after.timeline.outDurationSec || 0);
  let level = "NONE";
  const ranges = [];
  for (const r of results) {
    level = U.maxLevel(level, r.level);
    if (r.level === "NONE") continue;
    const rr = [];
    for (const t of r.targets) {
      if (t.all) rr.push([0, dur]);
      else if (t.out) rr.push([Math.min(t.out[0], t.out[1]), Math.max(t.out[0], t.out[1])]);
      else if (t.src) {
        for (const m of [beforeMap, afterMap]) {
          if (!m) continue;
          const a = m.srcToOutStart(t.src[0]), b = m.srcToOutEnd(t.src[1]);
          rr.push([Math.min(a, b), Math.max(a, b)]);
        }
      } else if (t.el) {
        const oldCue = before && before.captions ? before.captions.cues.find((c) => c.id === t.el) : null;
        const keys = oldCue ? new Set(oldCue.words.map((w) => w.key)) : null;
        rr.push(...spansOf(before, t.el, null), ...spansOf(after, t.el, keys));
      }
    }
    if (!rr.length) rr.push([0, dur]);
    if (r.level === "SHIFT") ranges.push([Math.min(...rr.map((x) => x[0])), dur]);
    else ranges.push(...rr.map(([a, b]) => [Math.max(0, a), Math.min(dur, Math.max(a, b))]));
  }
  // The per-op table cannot know every side effect (effects / effectsEnabled add or remove FREEZE holds): any
  // change of the piece geometry shifts everything after the first differing piece.
  const beforeHash = before && before.timeline ? before.timeline.mapHash : "";
  if (beforeHash && after.timeline.mapHash && beforeHash !== after.timeline.mapHash && U.levelRank(level) < U.levelRank("SHIFT")) {
    const A = after.timeline.pieces;
    const same = (x, y) => ["srcIn", "srcOut", "outIn", "outOut", "rate"].every((k) => Math.abs(x[k] - y[k]) < 1e-9) && x.kind === y.kind;
    let k = 0;
    while (k < A.length && k < beforePieces.length && same(A[k], beforePieces[k])) k++;
    const at = Math.min(k < beforePieces.length ? beforePieces[k].outIn : dur, k < A.length ? A[k].outIn : dur);
    level = "SHIFT";
    ranges.push([at, dur]);
  }
  return { level, ranges: U.mergeRanges(ranges) };
}

// ---------------------------------------------------------------- entry point
function applyOps(plan, ops, ctx = {}) {
  if (!isPlain(plan) || !isPlain(plan.provenance) || !Array.isArray(plan.provenance.ops)) {
    throw new EditError("INVALID_PLAN", { status: 500, errorClass: "bug", detail: "applyOps: a plan with provenance is required" });
  }
  if (!Number.isFinite(ctx.now) || ctx.now < 0) throw new EditError("OPS_CONTEXT", { status: 500, errorClass: "bug", detail: "applyOps: ctx.now (ms epoch) is required" });
  if (!Array.isArray(ops) || !ops.length) throw U.invalidOp(-1, "ops must be a non-empty array");
  if (ops.length > MAX_OPS) throw U.invalidOp(MAX_OPS, `at most ${MAX_OPS} ops per batch`);
  const words = Array.isArray(ctx.words) ? ctx.words : [];

  const run = runBatch(plan, ops, ctx, ops.length);
  let fin;
  try { fin = finalize(run.draft, ctx, words); }
  catch (e) { const idx = locateFailure(plan, ops, ctx, words); throw toInvalid(e, idx); }
  if (!fin.check.ok) {
    const idx = locateFailure(plan, ops, ctx, words);
    const first = fin.check.issues[0];
    throw U.invalidOp(idx, `the edit would make the plan invalid (${first.path}: ${first.message})`, { issues: fin.check.issues.slice(0, 5) });
  }
  return {
    plan: fin.check.plan,
    warnings: run.warnings,
    invalidates: computeInvalidation(plan, fin.after, run.results),
    costEvents: run.costEvents,
    applied: ops.length,
    projectPatch: run.projectPatch,
  };
}

module.exports = { applyOps, OP_TYPES, HANDLERS, computeInvalidation, parseEnvelope, MAX_OPS };
