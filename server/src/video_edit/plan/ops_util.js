// VIDEO EDIT OPS — shared helpers for plan/ops.js and its handler modules.
//
// WHY THIS EXISTS. The op handlers (captions, cuts, B-roll, effects/audio/branding/…) all need the same
// small vocabulary: how to reject an op with a reason the client can show, how invalidation levels
// order, how an element is looked up, how user ownership is marked, how deterministic ids are minted
// without a clock or RNG. Keeping it in one dependency-free module keeps the handlers short and makes
// the rules (e.g. "SHIFT outranks BASE outranks COMPOSITE outranks AUDIO outranks NONE") single-sourced.
//
// CONTRACT:
//   LEVELS ['NONE','AUDIO','COMPOSITE','BASE','SHIFT'] · levelRank(l) · maxLevel(a, b)
//   OpRejection(reason, extra) — thrown by handlers; ops.js turns it into 422 INVALID_OP {index, reason}
//   reject(reason, extra) -> never · invalidOp(index, reason, extra) -> EditError
//   hashHex(str, n) · clone(v) · r3 · r6 · clamp
//   findEl(plan, kind, id) -> element|null   kind: 'broll'|'effect'|'graphic'|'sfx'|'transition'|'cut'|'segment'
//   requireEl(plan, kind, id) -> element (rejects NOT_FOUND-style reasons)
//   markUser(el) — sets userModified=true where the element has that field
//   touchedIdsFromProvenance(plan) -> Set of element ids any user op touched
//   mergeRanges([[a,b]…]) -> merged, sorted, ms-rounded
//   dbToGain(db) · wordsSpan(words, w0, w1) -> [start, end]|null
//   Targets returned by handlers: { all:true } | { el:id } | { src:[a,b] } | { out:[a,b] }

const crypto = require("node:crypto");
const { EditError } = require("../errors");

const LEVELS = Object.freeze(["NONE", "AUDIO", "COMPOSITE", "BASE", "SHIFT"]);
const levelRank = (l) => Math.max(0, LEVELS.indexOf(l));
const maxLevel = (a, b) => (levelRank(b) > levelRank(a) ? b : a);

class OpRejection extends Error {
  constructor(reason, extra = null) {
    super(reason);
    this.name = "OpRejection";
    this.reason = String(reason).slice(0, 200);
    this.extra = extra && typeof extra === "object" ? extra : null;
  }
}

function reject(reason, extra) { throw new OpRejection(reason, extra); }

function invalidOp(index, reason, extra = null) {
  return new EditError("INVALID_OP", {
    status: 422, errorClass: "input", detail: `op ${index}: ${reason}`,
    extra: { index, reason: String(reason).slice(0, 200), ...(extra || {}) },
  });
}

const hashHex = (s, n = 10) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, n);
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const r3 = (x) => Math.round(x * 1000) / 1000;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const COLLECTIONS = Object.freeze({
  broll: (p) => p.broll, effect: (p) => p.effects, graphic: (p) => p.graphics, sfx: (p) => p.sfx,
  transition: (p) => p.transitions, cut: (p) => p.cuts, segment: (p) => p.aRoll.segments,
});

function findEl(plan, kind, id) {
  const arr = COLLECTIONS[kind] ? COLLECTIONS[kind](plan) : null;
  return Array.isArray(arr) ? arr.find((el) => el && el.id === id) || null : null;
}

function requireEl(plan, kind, id) {
  const el = findEl(plan, kind, id);
  if (!el) reject(`${kind} '${id}' does not exist`);
  return el;
}

function markUser(el) {
  if (el && Object.prototype.hasOwnProperty.call(el, "userModified")) el.userModified = true;
  return el;
}

// settings.set is not a touch: its elementIds are the items a re-plan added or removed, and counting them
// would make every re-planned item permanently un-re-plannable (and a re-minted id inherit protection).
const NOT_A_TOUCH = new Set(["settings.set"]);
function touchedIdsFromProvenance(plan) {
  const out = new Set();
  const ops = plan && plan.provenance && Array.isArray(plan.provenance.ops) ? plan.provenance.ops : [];
  for (const o of ops) if (!NOT_A_TOUCH.has(o.type)) for (const id of o.elementIds || []) out.add(id);
  return out;
}

function mergeRanges(ranges) {
  const list = (ranges || [])
    .filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]))
    .map(([a, b]) => [r3(Math.max(0, Math.min(a, b))), r3(Math.max(0, Math.max(a, b)))])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = [];
  for (const r of list) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

const dbToGain = (db) => Math.pow(10, db / 20);

function wordsSpan(words, w0, w1) {
  const a = words && words[w0], b = words && words[w1];
  return a && b ? [a.start, b.end] : null;
}

module.exports = {
  LEVELS, levelRank, maxLevel, OpRejection, reject, invalidOp, hashHex, clone, r3, r6, clamp,
  findEl, requireEl, markUser, touchedIdsFromProvenance, mergeRanges, dbToGain, wordsSpan,
};
