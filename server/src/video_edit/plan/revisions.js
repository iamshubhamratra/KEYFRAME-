// VIDEO EDIT PLAN REVISIONS — commit, undo, redo and history for Edit Plan revisions (EDIT_PLAN.md §8,
// ENGINE.md §3.5).
//
// WHY THIS EXISTS. Every op batch, undo and redo produces a NEW immutable revision; history is never
// rewritten, so an export can always name the exact plan it was rendered from and a crashed request
// can be retried safely. Three races must be closed under the project mutex: two tabs editing the same
// head (409 REVISION_CONFLICT carrying the head the client must rebase on), a client retrying a batch
// whose first attempt succeeded but whose response was lost (batchId replay returns the original result
// instead of applying twice), and undo/redo interleaving with edits (undo creates revision r+1 whose
// content equals the target revision; a new edit clears the redo stack).
//
// CONTRACT:
//   commitRevision({ store, projectId, plan, author='user', summary='', opsCount=0, expectedRevision, batchId=null,
//                    now=Date.now(), response=null, runId }) -> Promise<{ revision, hash, replayed, response }>
//     stamps revision=head+1, parentRevision=head|null, createdAt=now, createdBy=author; validates with parsePlan;
//     pushes { rev: previousHead, label: summary } on the undo stack and clears redo; remembers the last 50 batchIds
//     in project.plan.batches ({ batchId, rev, hash, response }).
//     409 REVISION_CONFLICT extra { headRevision } when expectedRevision !== head (checked after batch replay).
//   undo({ store, projectId, expectedRevision, batchId, now }) / redo(...) -> Promise<{ revision, hash, replayed, label,
//     invalidates }> — new revision equal to the target's content; 409 NOTHING_TO_UNDO / NOTHING_TO_REDO.
//   historyView(project) -> { canUndo, canRedo, undoLabel, redoLabel }
//   diffLevelsFromOps([{ level, ranges }]) -> { level, ranges }   (merge of applyOps invalidations)
//   diffLevelsFromPlans(prev, next) -> { level, ranges, estimated:true }  (coarse per-level slice hashes; for undo/redo)
//   diffLevelsFromCompositions() -> throws NOT_IMPLEMENTED (composition-hash diffLevels arrives in Phase 7)

const { EditError } = require("../errors");
const { sha256Json } = require("../fsx");
const { parsePlan, ENUMS } = require("./schema");
const U = require("./ops_util");

const BATCH_KEEP = 50;
const STACK_CAP = 100;
const LABEL_MAX = 120;

function conflict(head) {
  return new EditError("REVISION_CONFLICT", { status: 409, errorClass: "input", extra: { headRevision: head } });
}

function requireStore(store, projectId) {
  if (!store || typeof store.withLock !== "function" || typeof store.saveRevision !== "function") {
    throw new EditError("REVISIONS_BAD_CALL", { status: 500, errorClass: "bug", detail: "a video_edit store is required" });
  }
  if (typeof projectId !== "string") throw new EditError("NOT_FOUND", { status: 404, errorClass: "input" });
}

const stackOf = (arr) => (Array.isArray(arr) ? arr : [])
  .map((e) => (Number.isInteger(e) ? { rev: e, label: null } : e))
  .filter((e) => e && Number.isInteger(e.rev) && e.rev > 0);

function headOf(project) {
  const pl = project.plan || {};
  const revs = Array.isArray(pl.revisions) ? pl.revisions.map((r) => r.rev || 0) : [];
  return Math.max(Number.isInteger(pl.headRevision) ? pl.headRevision : 0, 0, ...revs);
}

function findBatch(project, batchId) {
  if (batchId == null) return null;
  const list = project.plan && Array.isArray(project.plan.batches) ? project.plan.batches : [];
  return list.find((b) => b && b.batchId === String(batchId)) || null;
}

function loadProject(store, projectId) {
  const project = store.get(projectId);
  if (!project) throw new EditError("NOT_FOUND", { status: 404, errorClass: "input" });
  return project;
}

async function commitInsideLock({ store, projectId, plan, author, summary, opsCount, expectedRevision, batchId, now, response, runId, stacks }) {
  const project = loadProject(store, projectId);
  const hit = findBatch(project, batchId);
  if (hit) return { revision: hit.rev, hash: hit.hash, replayed: true, response: hit.response == null ? null : hit.response };
  const head = headOf(project);
  if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== head) throw conflict(head);
  if (!plan || typeof plan !== "object") throw new EditError("INVALID_PLAN", { status: 422, errorClass: "input", detail: "plan required" });

  const rev = head + 1;
  const stamped = U.clone(plan);
  stamped.revision = rev;
  stamped.parentRevision = head > 0 ? head : null;
  stamped.createdAt = now;
  stamped.createdBy = ENUMS.createdBy.includes(author) ? author : "user";
  const check = parsePlan(stamped);
  if (!check.ok) {
    const i = check.issues[0];
    throw new EditError("INVALID_PLAN", { status: 422, errorClass: "input", detail: `${i.path}: ${i.message}`, extra: { issues: check.issues.slice(0, 5) } });
  }
  const label = String(summary || "").slice(0, LABEL_MAX);
  const saved = await store.saveRevision(projectId, check.plan, { author, summary: label, opsCount, runId });
  if (saved.rev !== rev) throw new EditError("REVISION_SEQUENCE", { status: 500, errorClass: "bug", detail: `expected r${rev}, store wrote r${saved.rev}` });

  await store.update(projectId, (d) => {
    const pl = d.plan;
    if (stacks) { pl.undo = stacks.undo; pl.redo = stacks.redo; }
    else {
      if (head > 0) pl.undo = [...stackOf(pl.undo), { rev: head, label }].slice(-STACK_CAP);
      pl.redo = [];
    }
    if (batchId != null) {
      const list = Array.isArray(pl.batches) ? pl.batches.filter((b) => b.batchId !== String(batchId)) : [];
      pl.batches = [...list, { batchId: String(batchId).slice(0, 80), rev, hash: saved.hash, response: response == null ? null : response, at: now }].slice(-BATCH_KEEP);
    }
  }, { runId });
  return { revision: rev, hash: saved.hash, replayed: false, response: response == null ? null : response };
}

function commitRevision(args = {}) {
  const { store, projectId } = args;
  requireStore(store, projectId);
  const now = Number.isFinite(args.now) ? args.now : Date.now();
  return store.withLock(projectId, () => commitInsideLock({
    author: "user", summary: "", opsCount: 0, batchId: null, response: null, ...args, now, stacks: null,
  }));
}

function step(direction) {
  const from = direction === "undo" ? "undo" : "redo";
  const to = direction === "undo" ? "redo" : "undo";
  return function run({ store, projectId, expectedRevision, batchId = null, now, runId } = {}) {
    requireStore(store, projectId);
    const ts = Number.isFinite(now) ? now : Date.now();
    return store.withLock(projectId, async () => {
      const project = loadProject(store, projectId);
      const hit = findBatch(project, batchId);
      if (hit) return { revision: hit.rev, hash: hit.hash, replayed: true, label: hit.response && hit.response.label ? hit.response.label : null, invalidates: hit.response ? hit.response.invalidates : null };
      const head = headOf(project);
      if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== head) throw conflict(head);
      const src = stackOf(project.plan && project.plan[from]);
      if (!src.length) throw new EditError(direction === "undo" ? "NOTHING_TO_UNDO" : "NOTHING_TO_REDO", { status: 409, errorClass: "input" });
      const entry = src[src.length - 1];
      const target = store.loadRevision(projectId, entry.rev);
      const current = store.loadRevision(projectId, head);
      if (!target) throw new EditError("REVISION_CORRUPT", { status: 500, errorClass: "resource", extra: { rev: entry.rev } });
      const label = entry.label || `revision ${entry.rev}`;
      const invalidates = diffLevelsFromPlans(current && current.plan, target.plan);
      const dst = stackOf(project.plan && project.plan[to]);
      const stacks = {
        [from]: src.slice(0, -1),
        [to]: [...dst, { rev: head, label }].slice(-STACK_CAP),
      };
      const res = await commitInsideLock({
        store, projectId, plan: target.plan, author: "user", summary: `${direction === "undo" ? "Undo" : "Redo"}: ${label}`,
        opsCount: 0, expectedRevision: head, batchId, now: ts, response: { label, invalidates }, runId, stacks,
      });
      return { revision: res.revision, hash: res.hash, replayed: false, label, invalidates };
    });
  };
}

const undo = step("undo");
const redo = step("redo");

function historyView(project) {
  const pl = (project && project.plan) || {};
  const u = stackOf(pl.undo), r = stackOf(pl.redo);
  return {
    canUndo: u.length > 0,
    canRedo: r.length > 0,
    undoLabel: u.length ? u[u.length - 1].label || null : null,
    redoLabel: r.length ? r[r.length - 1].label || null : null,
  };
}

function diffLevelsFromOps(list) {
  let level = "NONE";
  const ranges = [];
  for (const inv of Array.isArray(list) ? list : []) {
    if (!inv) continue;
    level = U.maxLevel(level, U.LEVELS.includes(inv.level) ? inv.level : "NONE");
    if (Array.isArray(inv.ranges)) ranges.push(...inv.ranges);
  }
  return { level, ranges: level === "NONE" ? [] : U.mergeRanges(ranges) };
}

const BASE_EFFECTS = new Set(["PUNCH_IN", "PUNCH_OUT", "JUMP_ZOOM", "ZOOM_EMPHASIS", "REFRAME"]);

function diffLevelsFromPlans(prev, next) {
  if (!prev || !next) {
    const dur = next && next.timeline ? next.timeline.outDurationSec : 0;
    return { level: "SHIFT", ranges: [[0, U.r3(dur || 0)]], estimated: true };
  }
  const h = (v) => sha256Json(v == null ? null : v);
  const slice = {
    shift: (p) => [p.timeline && p.timeline.mapHash, p.effects.filter((e) => e.kind === "FREEZE" || e.kind === "SPEED").map((e) => [e.id, e.enabled, e.anchor, e.atSrc, e.rate])],
    base: (p) => [p.output, p.aRoll.segments.map((s) => [s.id, s.framing]), p.timeline && p.timeline.pieces.map((x) => x.chunkKey),
      p.effects.filter((e) => BASE_EFFECTS.has(e.kind)).map((e) => [e.id, e.enabled, e.anchor, e.zoom, e.toZoom, e.cx, e.cy]),
      p.broll.filter((b) => b.layout === "SPLIT").map((b) => [b.id, b.status, b.chosen && b.chosen.assetId]), p.settings.effectsEnabled],
    composite: (p) => [p.captions, p.broll, p.graphics, p.branding, p.transitions],
    audio: (p) => [p.music, p.sfx, p.settings.sfxEnabled, p.settings.musicEnabled],
  };
  let level = "NONE";
  if (h(slice.audio(prev)) !== h(slice.audio(next))) level = "AUDIO";
  if (h(slice.composite(prev)) !== h(slice.composite(next))) level = "COMPOSITE";
  if (h(slice.base(prev)) !== h(slice.base(next))) level = "BASE";
  if (h(slice.shift(prev)) !== h(slice.shift(next))) level = "SHIFT";
  const dur = Math.max(prev.timeline ? prev.timeline.outDurationSec : 0, next.timeline ? next.timeline.outDurationSec : 0);
  return { level, ranges: level === "NONE" ? [] : [[0, U.r3(dur)]], estimated: true };
}

function diffLevelsFromCompositions() {
  throw new EditError("NOT_IMPLEMENTED", { status: 501, errorClass: "bug", detail: "diffLevelsFromCompositions (composition-hash diffLevels) arrives in Phase 7" });
}

module.exports = {
  commitRevision, undo, redo, historyView, diffLevelsFromOps, diffLevelsFromPlans, diffLevelsFromCompositions, BATCH_KEEP, STACK_CAP,
};
