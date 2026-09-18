// EDITOR STATE — reducer, store, contexts, hooks and the op queue for the AI Video Edit editor.
//
// State is split by update frequency (UX.md §4.2): this module holds everything that changes on a
// user action or a server event; the playhead lives outside React in playerClock.js.
//
// THE OPTIMISTIC MODEL. `serverPlan` is the last plan the server returned. Every change the person
// makes becomes an `entry` ({ ops, label, state }) that is applied locally on top of serverPlan
// (only ops marked optimistic in editModel.OP_META) to give `plan`, the plan the UI renders. When
// the server confirms a batch the entry stays until a fetched plan at that revision arrives, so the
// screen never flickers back to the old value in between. A 422 drops the entry (the change rolls
// back) and pins an inline error on the card; a 409 refetches, re-validates what is still queued
// and drops what no longer applies, with a Re-apply offer.
//
// Store vs useReducer: createEditorStore wraps the same reducer in an external store so a
// controller (network code, timers) can read the current state right after dispatching. Read it in
// components with useEditorStore(store) (useSyncExternalStore) and provide it through the contexts.

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import {
  applyOpLocal, opMeta, opLabel, opTargets, dirtyEstimate, validateOp, coalesceKeyFor,
  outline as buildOutline, mergeRanges, estimatePreviewSec, isAudioOnly, AUTO_UPDATE_MAX_SEC,
} from "./editModel.js";

// ---------------------------------------------------------------- constants
export const PANELS = Object.freeze(["transcript", "captions", "broll", "effects", "audio", "branding", "format"]);
export const PANEL_LABELS = Object.freeze({ transcript: "Transcript & Cuts", captions: "Captions", broll: "B-roll", effects: "Effects", audio: "Audio", branding: "Branding", format: "Format" });
export const PANEL_FOR_KIND = Object.freeze({ caption: "captions", broll: "broll", effect: "effects", graphic: "effects", transition: "effects", cut: "transcript", segment: "format", music: "audio", sfx: "audio", logo: "branding" });

export const A = Object.freeze({
  LOAD_START: "LOAD_START",
  LOAD_SUCCESS: "LOAD_SUCCESS",
  LOAD_ERROR: "LOAD_ERROR",
  VIEW_UPDATED: "VIEW_UPDATED",
  PLAN_LOADED: "PLAN_LOADED",
  TRANSCRIPT_LOADED: "TRANSCRIPT_LOADED",
  REVISIONS_LOADED: "REVISIONS_LOADED",
  OPS_ENQUEUED: "OPS_ENQUEUED",
  OPS_SENDING: "OPS_SENDING",
  OPS_APPLIED: "OPS_APPLIED",
  OPS_REJECTED: "OPS_REJECTED",
  CONFLICT_RESOLVED: "CONFLICT_RESOLVED",
  CLEAR_CONFLICT: "CLEAR_CONFLICT",
  QUEUE_STATUS: "QUEUE_STATUS",
  HISTORY_MOVED: "HISTORY_MOVED",
  RENDER_UPDATED: "RENDER_UPDATED",
  EXPORTS_LOADED: "EXPORTS_LOADED",
  SELECT: "SELECT",
  SET_PANEL: "SET_PANEL",
  SET_AUTO_UPDATE: "SET_AUTO_UPDATE",
  OPEN_DIALOG: "OPEN_DIALOG",
  CLOSE_DIALOG: "CLOSE_DIALOG",
  TOAST_PUSH: "TOAST_PUSH",
  TOAST_DISMISS: "TOAST_DISMISS",
  DISMISS_ITEM_ERROR: "DISMISS_ITEM_ERROR",
});

export function createInitialState({ editId = null, autoUpdate = true, panel = "transcript" } = {}) {
  return {
    editId,
    loadState: "loading", // loading | ready | error | notFound
    error: null,
    view: null,
    serverPlan: null,
    serverRevision: 0,
    serverHash: null,
    serverOutline: null, // { revision, value } when a response carried one
    plan: null,
    outline: null,
    revision: 0,
    transcript: null,
    history: { head: 0, canUndo: false, canRedo: false, undoLabel: null, redoLabel: null, revisions: [] },
    entries: [],
    queue: { state: "idle", pending: 0, attempt: 0 },
    render: null,
    exportRender: null,
    previewRevision: null,
    previewRenderId: null,
    exports: null,
    warnings: [],
    dirty: [],
    pendingItemIds: [],
    itemErrors: {},
    selection: null,
    panel,
    ui: { autoUpdate, dialog: null, toasts: [] },
    conflict: null,
  };
}
export const initialState = Object.freeze(createInitialState());

// ---------------------------------------------------------------- derivation
function derivePlan(state) {
  const ctx = { words: state.transcript?.words };
  let plan = state.serverPlan;
  if (plan) {
    for (const e of state.entries) {
      if (!e.optimistic) continue;
      for (const op of e.ops) {
        const r = applyOpLocal(plan, op, ctx);
        if (r.ok) plan = r.plan;
      }
    }
  }
  const useServerOutline = plan && state.entries.length === 0 && state.serverOutline?.revision === state.serverRevision;
  const outline = plan ? (useServerOutline ? state.serverOutline.value : buildOutline(plan, ctx)) : null;
  return withPending({ ...state, plan, outline });
}

function withPending(state) {
  const preview = state.previewRevision ?? -1;
  const live = state.dirty.filter((d) => d.revision > preview);
  const ids = new Set();
  for (const d of live) for (const id of d.targets || []) ids.add(id);
  for (const e of state.entries) for (const id of e.targets) ids.add(id);
  return { ...state, pendingItemIds: [...ids] };
}

function latestPreview(view) {
  const renders = Array.isArray(view?.renders) ? view.renders : [];
  const previews = renders.filter((r) => r.kind === "preview");
  const done = previews.filter((r) => r.status === "done").sort((a, b) => b.planRevision - a.planRevision)[0] || null;
  const active = previews.filter((r) => r.status === "queued" || r.status === "running").sort((a, b) => b.planRevision - a.planRevision)[0] || null;
  const exp = renders.filter((r) => r.kind === "export").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
  return { done, active, exp };
}

const errorMessage = (err) => err?.body?.message || err?.message || "That change couldn't be applied.";

// ---------------------------------------------------------------- reducer
export function editorReducer(state, action) {
  switch (action.type) {
    case A.LOAD_START:
      return { ...state, loadState: "loading", error: null };

    case A.LOAD_SUCCESS: {
      const { view, plan, transcript, revisions, outline } = action;
      const { done, active, exp } = latestPreview(view);
      const next = {
        ...state,
        loadState: "ready",
        error: null,
        view: view || state.view,
        transcript: transcript ?? state.transcript,
        serverPlan: plan?.plan ?? state.serverPlan,
        serverRevision: plan?.revision ?? state.serverRevision,
        serverHash: plan?.hash ?? state.serverHash,
        serverOutline: outline && plan ? { revision: plan.revision, value: outline } : state.serverOutline,
        revision: Math.max(state.revision, plan?.revision ?? 0),
        previewRevision: done?.planRevision ?? state.previewRevision,
        previewRenderId: done?.renderId ?? state.previewRenderId,
        render: active || state.render,
        exportRender: exp || state.exportRender,
        history: revisions ? historyFrom(revisions) : view?.plan ? { ...state.history, head: view.plan.headRevision, canUndo: !!view.plan.canUndo, canRedo: !!view.plan.canRedo } : state.history,
      };
      return derivePlan(next);
    }

    case A.LOAD_ERROR:
      return { ...state, loadState: action.notFound ? "notFound" : "error", error: action.error || null };

    case A.VIEW_UPDATED: {
      const view = action.view;
      if (!view) return state;
      const { done, active, exp } = latestPreview(view);
      const previewRevision = done && (state.previewRevision == null || done.planRevision >= state.previewRevision) ? done.planRevision : state.previewRevision;
      const next = {
        ...state,
        view,
        previewRevision,
        previewRenderId: done && previewRevision === done.planRevision ? done.renderId : state.previewRenderId,
        render: active || (state.render && state.render.status !== "failed" && done && done.planRevision >= (state.render.planRevision ?? 0) ? null : state.render),
        exportRender: exp || state.exportRender,
        dirty: previewRevision != null ? state.dirty.filter((d) => d.revision > previewRevision) : state.dirty,
        history: view.plan && !state.entries.length ? { ...state.history, head: view.plan.headRevision, canUndo: !!view.plan.canUndo, canRedo: !!view.plan.canRedo } : state.history,
      };
      return withPending(next);
    }

    case A.PLAN_LOADED: {
      if (!action.plan || action.revision < state.serverRevision) return state;
      const entries = state.entries.filter((e) => !(e.state === "confirmed" && e.revision <= action.revision));
      return derivePlan({
        ...state,
        serverPlan: action.plan,
        serverRevision: action.revision,
        serverHash: action.hash ?? state.serverHash,
        serverOutline: action.outline ? { revision: action.revision, value: action.outline } : state.serverOutline,
        revision: Math.max(state.revision, action.revision),
        entries,
      });
    }

    case A.TRANSCRIPT_LOADED:
      return derivePlan({ ...state, transcript: action.transcript });

    case A.REVISIONS_LOADED:
      return { ...state, history: historyFrom(action.revisions) };

    case A.OPS_ENQUEUED: {
      const ops = Array.isArray(action.ops) ? action.ops : [action.ops];
      const basis = state.plan;
      const optimistic = ops.some((op) => opMeta(op)?.optimistic);
      const estimate = ops.map((op) => dirtyEstimate(op, basis));
      const entry = {
        localId: action.localId,
        ops,
        label: action.label || opLabel(ops[0], basis),
        state: "queued",
        revision: null,
        optimistic,
        targets: [...new Set(ops.flatMap(opTargets))],
        estimate,
        at: action.at ?? 0,
      };
      const exists = state.entries.some((e) => e.localId === action.localId);
      const entries = exists ? state.entries.map((e) => (e.localId === action.localId ? { ...entry, at: e.at } : e)) : [...state.entries, entry];
      let view = state.view;
      const titleOp = ops.find((op) => op.type === "edit.setTitle");
      if (titleOp && view) view = { ...view, title: titleOp.title.trim() };
      const itemErrors = { ...state.itemErrors };
      for (const id of entry.targets) delete itemErrors[id];
      return derivePlan({ ...state, entries, view, itemErrors });
    }

    case A.OPS_SENDING:
      return { ...state, entries: state.entries.map((e) => (e.localId === action.localId ? { ...e, state: "sending" } : e)) };

    case A.OPS_APPLIED: {
      const res = action.response || {};
      const entry = state.entries.find((e) => e.localId === action.localId);
      if (!entry) return state;
      const revision = Number.isInteger(res.revision) ? res.revision : state.revision;
      const level = res.invalidates?.level || entry.estimate.reduce((lv, d) => (rank(d.level) > rank(lv) ? d.level : lv), "NONE");
      const ranges = Array.isArray(res.invalidates?.ranges) ? res.invalidates.ranges : entry.estimate.flatMap((d) => d.ranges);
      const dirty = level === "NONE" ? state.dirty : [...state.dirty, { revision, level, ranges, targets: entry.targets, label: entry.label }];
      return withPending({
        ...state,
        entries: state.entries.map((e) => (e.localId === action.localId ? { ...e, state: "confirmed", revision } : e)),
        revision: Math.max(state.revision, revision),
        dirty,
        warnings: Array.isArray(res.warnings) && res.warnings.length ? res.warnings : state.warnings,
        history: { ...state.history, head: revision, canUndo: true, canRedo: false, undoLabel: entry.label, redoLabel: null },
      });
    }

    case A.OPS_REJECTED: {
      const entry = state.entries.find((e) => e.localId === action.localId);
      if (!entry) return state;
      const itemErrors = { ...state.itemErrors };
      const message = action.message || errorMessage(action.error);
      for (const id of entry.targets) itemErrors[id] = message;
      return derivePlan({ ...state, entries: state.entries.filter((e) => e.localId !== action.localId), itemErrors });
    }

    case A.CONFLICT_RESOLVED: {
      const droppedIds = new Set((action.dropped || []).filter((d) => !d.partial).map((d) => d.localId));
      const keptOps = new Map((action.kept || []).map((k) => [k.localId, k.ops]));
      const entries = state.entries
        .filter((e) => !droppedIds.has(e.localId))
        .filter((e) => e.state !== "confirmed")
        .map((e) => (keptOps.has(e.localId) ? { ...e, ops: keptOps.get(e.localId), state: "queued" } : e));
      const dropped = (action.dropped || []).map((d) => ({ label: d.label, ops: d.ops }));
      return derivePlan({
        ...state,
        serverPlan: action.plan ?? state.serverPlan,
        serverRevision: action.revision ?? state.serverRevision,
        serverHash: action.hash ?? state.serverHash,
        revision: action.revision ?? state.revision,
        entries,
        conflict: { toRevision: action.revision, dropped, at: action.at ?? 0 },
      });
    }

    case A.CLEAR_CONFLICT:
      return { ...state, conflict: null };

    case A.QUEUE_STATUS:
      return { ...state, queue: { state: action.state, pending: action.pending ?? state.entries.length, attempt: action.attempt ?? 0, retryInMs: action.retryInMs ?? null } };

    case A.HISTORY_MOVED: {
      const res = action.response || {};
      const revision = Number.isInteger(res.revision) ? res.revision : state.revision;
      const level = res.invalidates?.level || "COMPOSITE";
      const dirty = level === "NONE" ? state.dirty : [...state.dirty, { revision, level, ranges: res.invalidates?.ranges || [], targets: [], label: action.label }];
      const undo = action.direction === "undo";
      return withPending({
        ...state,
        revision: Math.max(state.revision, revision),
        dirty,
        history: { ...state.history, head: revision, canRedo: undo ? true : state.history.canRedo, redoLabel: undo ? action.label || state.history.redoLabel : state.history.redoLabel },
      });
    }

    case A.RENDER_UPDATED: {
      const r = action.render;
      if (!r) return state;
      if (r.kind === "export") return { ...state, exportRender: { ...(state.exportRender?.renderId === r.renderId ? state.exportRender : {}), ...r } };
      if (r.status === "done") {
        if (state.previewRevision != null && r.planRevision < state.previewRevision) return state;
        return withPending({
          ...state,
          previewRevision: r.planRevision,
          previewRenderId: r.renderId,
          render: state.render && state.render.renderId !== r.renderId && state.render.planRevision > r.planRevision ? state.render : null,
          dirty: state.dirty.filter((d) => d.revision > r.planRevision),
        });
      }
      const merged = { ...(state.render?.renderId === r.renderId ? state.render : {}), ...r };
      return { ...state, render: merged };
    }

    case A.EXPORTS_LOADED:
      return { ...state, exports: action.exports };

    case A.SELECT: {
      const sel = action.selection || null;
      const panel = sel && !action.keepPanel ? PANEL_FOR_KIND[sel.kind] || state.panel : state.panel;
      return { ...state, selection: sel, panel };
    }

    case A.SET_PANEL:
      return PANELS.includes(action.panel) ? { ...state, panel: action.panel } : state;

    case A.SET_AUTO_UPDATE:
      return { ...state, ui: { ...state.ui, autoUpdate: !!action.value } };

    case A.OPEN_DIALOG:
      return { ...state, ui: { ...state.ui, dialog: action.dialog || null } };

    case A.CLOSE_DIALOG:
      return state.ui.dialog ? { ...state, ui: { ...state.ui, dialog: null } } : state;

    case A.TOAST_PUSH: {
      const toasts = [...state.ui.toasts.filter((t) => t.id !== action.toast.id), action.toast].slice(-4);
      return { ...state, ui: { ...state.ui, toasts } };
    }

    case A.TOAST_DISMISS:
      return { ...state, ui: { ...state.ui, toasts: state.ui.toasts.filter((t) => t.id !== action.id) } };

    case A.DISMISS_ITEM_ERROR: {
      if (!state.itemErrors[action.id]) return state;
      const itemErrors = { ...state.itemErrors };
      delete itemErrors[action.id];
      return { ...state, itemErrors };
    }

    default:
      return state;
  }
}

const LEVEL_RANK = { NONE: 0, AUDIO: 1, COMPOSITE: 2, BASE: 3, SHIFT: 4 };
const rank = (l) => LEVEL_RANK[l] ?? 0;

function historyFrom(r) {
  if (!r) return createInitialState().history;
  return { head: r.head ?? 0, canUndo: !!r.canUndo, canRedo: !!r.canRedo, undoLabel: r.undoLabel || null, redoLabel: r.redoLabel || null, revisions: Array.isArray(r.revisions) ? r.revisions : [] };
}

// ---------------------------------------------------------------- selectors
export function selectPendingChanges(state) {
  const preview = state.previewRevision ?? -1;
  const confirmedRevs = new Set(state.dirty.filter((d) => d.revision > preview).map((d) => d.revision));
  const unsent = state.entries.filter((e) => e.state !== "confirmed").length;
  return confirmedRevs.size + unsent;
}

export function selectDirty(state) {
  const preview = state.previewRevision ?? -1;
  const live = state.dirty.filter((d) => d.revision > preview).map((d) => ({ level: d.level, ranges: d.ranges }));
  const queued = state.entries.filter((e) => e.state !== "confirmed").flatMap((e) => e.estimate);
  return [...live, ...queued];
}

export const selectDirtyRanges = (state) => mergeRanges(selectDirty(state).filter((d) => d.level !== "NONE" && d.level !== "AUDIO").flatMap((d) => d.ranges || []));

export function selectPreviewEstimate(state) {
  const dirty = selectDirty(state);
  const aspectChange = state.entries.some((e) => e.ops.some((op) => op.type === "output.setAspect"));
  return { sec: estimatePreviewSec(dirty, state.plan, { aspectChange }), audioOnly: isAudioOnly(dirty) };
}

// Should the 1.2 s auto-update fire now? (Queue drained, something to render, cheap enough.)
export function selectShouldAutoUpdate(state) {
  if (!state.ui.autoUpdate || state.loadState !== "ready") return false;
  if (state.entries.some((e) => e.state !== "confirmed")) return false;
  if (selectPendingChanges(state) === 0) return false;
  if (state.render && (state.render.status === "queued" || state.render.status === "running") && state.render.planRevision >= state.revision) return false;
  const { sec, audioOnly } = selectPreviewEstimate(state);
  return audioOnly || sec <= AUTO_UPDATE_MAX_SEC;
}

export const selectIsPending = (state, id) => state.pendingItemIds.includes(id);

// ---------------------------------------------------------------- store & contexts
export function createEditorStore(init = createInitialState()) {
  let state = init;
  const listeners = new Set();
  return {
    getState: () => state,
    dispatch(action) {
      const next = editorReducer(state, action);
      if (next === state) return;
      state = next;
      for (const fn of [...listeners]) { try { fn(); } catch { /* keep notifying */ } }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function useEditorStore(store) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export const EditorStateCtx = createContext(null);
export const EditorActionsCtx = createContext(null);

export function useEditor(selector) {
  const state = useContext(EditorStateCtx);
  if (!state) throw new Error("useEditor must be used inside the editor provider");
  return selector ? selector(state) : state;
}

export function useEditorActions() {
  const actions = useContext(EditorActionsCtx);
  if (!actions) throw new Error("useEditorActions must be used inside the editor provider");
  return actions;
}

export function useSelection() {
  const selection = useContext(EditorStateCtx)?.selection ?? null;
  const actions = useEditorActions();
  return useMemo(() => ({
    selection,
    select: actions.select,
    clear: actions.clearSelection,
    isSelected: (kind, id) => !!selection && selection.kind === kind && selection.id === id,
  }), [selection, actions]);
}

// ---------------------------------------------------------------- op queue (UX.md §3)
// One request in flight. expectedRevision is read at send time; a batch keeps its batchId across
// network retries (1 s, 2 s, 4 s ± jitter) so the server can dedupe, then the queue holds
// ("offline") until resume(). Coalescable ops (OP_META.coalesceKey) replace a still-queued op with
// the same key and restart its 300–400 ms window. 409 → onConflict() returns the fresh head
// { revision, plan, hash }; every queued op is re-validated against it and invalid ones dropped.
export function createOpQueue({
  send,
  onConflict,
  validate = () => ({ ok: true }),
  initialRevision = 0,
  coalesceMs = 350,
  retryDelays = [1000, 2000, 4000],
  jitter = 0.2,
  maxConflictsPerBatch = 3,
  random = Math.random,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
  newBatchId = () => `b_${now().toString(36)}${Math.floor(random() * 1e8).toString(36)}`,
  onSending,
  onApplied,
  onRevalidated,
  onRejected,
  onStatus,
  onHold,
} = {}) {
  if (typeof send !== "function") throw new Error("createOpQueue: send is required");
  let entries = [];
  let inFlight = null;
  let revision = initialRevision;
  let hold = null;
  let timer = null;
  let disposed = false;
  let seq = 0;
  let waiters = [];

  const emit = (state, extra = {}) => { try { onStatus?.({ state, pending: entries.length, ...extra }); } catch { /* status is advisory */ } };
  const settleIdle = () => {
    if (entries.length || inFlight) return;
    const w = waiters; waiters = [];
    for (const fn of w) fn();
  };

  function schedule() {
    if (disposed || inFlight || hold) return;
    if (timer !== null) { clearTimer(timer); timer = null; }
    const head = entries[0];
    if (!head) { emit("idle"); settleIdle(); return; }
    const wait = Math.max(0, head.readyAt - now());
    timer = setTimer(() => { timer = null; pump(); }, wait);
  }

  async function pump() {
    if (disposed || inFlight || hold) return;
    const head = entries[0];
    if (!head) { schedule(); return; }
    if (head.readyAt > now()) { schedule(); return; }
    inFlight = head;
    if (!head.batchId) head.batchId = newBatchId();
    const payload = { expectedRevision: revision, batchId: head.batchId, ops: head.ops };
    emit(head.attempt ? "retrying" : "sending", { attempt: head.attempt });
    try { onSending?.(head); } catch { /* observer */ }
    let res;
    try {
      res = await send(payload, head);
    } catch (err) {
      inFlight = null;
      if (!disposed) await handleError(err, head);
      return;
    }
    inFlight = null;
    if (disposed) return;
    entries = entries.filter((e) => e !== head);
    if (Number.isInteger(res?.revision)) revision = res.revision;
    head.conflicts = 0;
    try { onApplied?.(res, head); } catch { /* observer */ }
    schedule();
  }

  async function handleError(err, head) {
    const status = Number(err?.status) || 0;
    const code = err?.code || err?.body?.error || null;

    if (status === 409 && (code === null || code === "REVISION_CONFLICT")) {
      head.conflicts = (head.conflicts || 0) + 1;
      if (head.conflicts > maxConflictsPerBatch || typeof onConflict !== "function") {
        entries = entries.filter((e) => e !== head);
        try { onRejected?.(err, head); } catch { /* observer */ }
        schedule();
        return;
      }
      let fresh;
      try {
        fresh = await onConflict(err, entries.slice());
      } catch (e2) {
        return retryOrHold(e2, head);
      }
      if (disposed) return;
      if (Number.isInteger(fresh?.revision)) revision = fresh.revision;
      const dropped = [];
      const kept = [];
      for (const e of entries) {
        const valid = [];
        const invalid = [];
        for (const op of e.ops) {
          let ok;
          try { ok = !!validate(op, fresh?.plan)?.ok; } catch { ok = false; }
          (ok ? valid : invalid).push(op);
        }
        if (invalid.length) dropped.push({ localId: e.localId, label: e.label, ops: invalid, partial: valid.length > 0 });
        if (valid.length) {
          e.ops = valid;
          e.batchId = null;
          e.attempt = 0;
          kept.push(e);
        }
      }
      entries = kept;
      try { onRevalidated?.({ revision, plan: fresh?.plan, hash: fresh?.hash, dropped, kept: kept.map((e) => ({ localId: e.localId, ops: e.ops, label: e.label })) }); } catch { /* observer */ }
      schedule();
      return;
    }

    const retryable = status === 0 || status === 408 || status === 423 || status === 425 || status === 429 || status >= 500;
    if (status === 401) {
      hold = "auth";
      emit("auth");
      try { onHold?.("auth", err); } catch { /* observer */ }
      return;
    }
    if (!retryable) {
      entries = entries.filter((e) => e !== head);
      try { onRejected?.(err, head); } catch { /* observer */ }
      schedule();
      return;
    }
    retryOrHold(err, head);
  }

  function retryOrHold(err, head) {
    head.attempt = (head.attempt || 0) + 1;
    if (head.attempt > retryDelays.length) {
      head.attempt = 0;
      hold = "offline";
      emit("offline");
      try { onHold?.("offline", err); } catch { /* observer */ }
      return;
    }
    const base = retryDelays[head.attempt - 1];
    const delay = Math.max(0, Math.round(base * (1 + (random() * 2 - 1) * jitter)));
    emit("retrying", { attempt: head.attempt, retryInMs: delay });
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => { timer = null; pump(); }, delay);
  }

  return {
    // enqueue(op | ops[], { localId?, label? }) → { localId, coalesced }
    enqueue(opsIn, { localId, label } = {}) {
      if (disposed) return { localId: null, coalesced: false };
      const ops = Array.isArray(opsIn) ? opsIn : [opsIn];
      const key = ops.length === 1 ? coalesceKeyFor(ops[0]) : null;
      if (key) {
        for (let k = entries.length - 1; k >= 0; k--) {
          const e = entries[k];
          if (e === inFlight) break;
          if (e.coalesceKey === key) {
            e.ops = ops;
            e.label = label || e.label;
            e.readyAt = now() + coalesceMs;
            schedule();
            return { localId: e.localId, coalesced: true };
          }
        }
      }
      const entry = { localId: localId || `l${++seq}`, ops, label: label || null, coalesceKey: key, readyAt: key ? now() + coalesceMs : 0, batchId: null, attempt: 0, conflicts: 0 };
      entries.push(entry);
      schedule();
      return { localId: entry.localId, coalesced: false };
    },
    flush() {
      for (const e of entries) e.readyAt = 0;
      schedule();
    },
    resume() {
      hold = null;
      if (timer !== null) { clearTimer(timer); timer = null; }
      if (entries[0]) entries[0].readyAt = Math.min(entries[0].readyAt, now());
      schedule();
    },
    whenIdle() {
      if (!entries.length && !inFlight) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },
    setRevision(n) { if (Number.isInteger(n)) revision = n; },
    getRevision: () => revision,
    pending: () => entries.length + (inFlight && !entries.includes(inFlight) ? 1 : 0),
    isHeld: () => hold,
    dispose() {
      disposed = true;
      if (timer !== null) { clearTimer(timer); timer = null; }
      entries = [];
      const w = waiters; waiters = [];
      for (const fn of w) fn();
    },
  };
}

// ---------------------------------------------------------------- controller
// Wires store + API + queue into the stable action object EditorActionsCtx provides.
// api: the editApi module (or a fake with the same functions). Returns { actions, queue, dispose }.
export function createEditorController({ editId, api, store, autoUpdateDelayMs = 1200, planRefreshMs = 250, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h), now = () => Date.now() }) {
  const { dispatch, getState } = store;
  let toastSeq = 0;
  let planTimer = null;
  let autoTimer = null;
  let disposed = false;
  const candidateListeners = new Set();

  const toast = (t) => {
    const item = typeof t === "string" ? { message: t } : t;
    const id = item.id || `t${++toastSeq}`;
    dispatch({ type: A.TOAST_PUSH, toast: { tone: "info", ...item, id } });
    return id;
  };

  const refreshPlan = () => {
    if (planTimer !== null) clearTimer(planTimer);
    planTimer = setTimer(async () => {
      planTimer = null;
      try {
        const p = await api.getPlan(editId);
        if (disposed) return;
        dispatch({ type: A.PLAN_LOADED, revision: p.revision, hash: p.hash, plan: p.plan, outline: p.outline });
        if (!queue.pending()) queue.setRevision(Math.max(queue.getRevision(), p.revision));
      } catch { /* the next event or op retries */ }
    }, planRefreshMs);
  };

  const refreshRevisions = async () => {
    try {
      const r = await api.getRevisions(editId);
      if (!disposed) dispatch({ type: A.REVISIONS_LOADED, revisions: r });
    } catch { /* history labels are advisory */ }
  };

  const scheduleAutoUpdate = () => {
    if (autoTimer !== null) clearTimer(autoTimer);
    autoTimer = setTimer(() => {
      autoTimer = null;
      if (!disposed && selectShouldAutoUpdate(getState())) actions.requestPreview();
    }, autoUpdateDelayMs);
  };

  const queue = createOpQueue({
    initialRevision: getState().revision,
    send: (payload) => api.applyOps(editId, payload),
    onConflict: async () => {
      const p = await api.getPlan(editId);
      return { revision: p.revision, plan: p.plan, hash: p.hash };
    },
    validate: (op, plan) => validateOp(op, plan, { words: getState().transcript?.words }),
    onSending: (entry) => dispatch({ type: A.OPS_SENDING, localId: entry.localId }),
    onApplied: (res, entry) => {
      dispatch({ type: A.OPS_APPLIED, localId: entry.localId, response: res });
      refreshPlan();
      scheduleAutoUpdate();
    },
    onRevalidated: ({ revision, plan, hash, dropped, kept }) => {
      dispatch({ type: A.CONFLICT_RESOLVED, revision, plan, hash, dropped, kept, at: now() });
      if (dropped.length) {
        const labels = dropped.map((d) => d.label).filter(Boolean).join(", ");
        const ops = dropped.flatMap((d) => d.ops);
        toast({ tone: "warn", title: "EDIT CHANGED ELSEWHERE", message: `This edit changed in another tab — reloaded to r${revision}. Not applied: *${labels || "your last change"}*.`, action: { label: "Re-apply", onAction: () => actions.apply(ops, { label: labels }) }, duration: 10000 });
      }
      refreshRevisions();
    },
    onRejected: (err, entry) => {
      dispatch({ type: A.OPS_REJECTED, localId: entry.localId, error: { status: err?.status, code: err?.code, message: err?.body?.message || err?.message, body: err?.body } });
    },
    onStatus: (s) => dispatch({ type: A.QUEUE_STATUS, ...s }),
  });

  const actions = {
    // apply(op | ops[], { label? }) → { ok, reason?, localId? }
    apply(opsIn, { label } = {}) {
      const ops = Array.isArray(opsIn) ? opsIn : [opsIn];
      const state = getState();
      for (const op of ops) {
        const v = validateOp(op, state.plan, { words: state.transcript?.words });
        if (!v.ok) return { ok: false, reason: v.reason, field: v.field };
      }
      const r = queue.enqueue(ops, { label: label || opLabel(ops[0], state.plan) });
      dispatch({ type: A.OPS_ENQUEUED, localId: r.localId, ops, label: label || opLabel(ops[0], state.plan), at: now() });
      if (autoTimer !== null) { clearTimer(autoTimer); autoTimer = null; }
      return { ok: true, localId: r.localId, coalesced: r.coalesced };
    },
    async undo() { return moveHistory("undo"); },
    async redo() { return moveHistory("redo"); },
    async requestPreview() {
      const state = getState();
      try {
        const res = await api.requestRender(editId, { kind: "preview", planRevision: state.revision, profile: "preview540" });
        if (!disposed) dispatch({ type: A.RENDER_UPDATED, render: { renderId: res.renderId, kind: "preview", planRevision: state.revision, status: res.cached ? "done" : "queued", pct: res.cached ? 100 : 0, queuePosition: res.queuePosition ?? 0 } });
        return { ok: true, ...res };
      } catch (err) {
        return { ok: false, error: err };
      }
    },
    async requestExport({ profile = "export1080" } = {}) {
      const state = getState();
      await queue.whenIdle();
      try {
        const res = await api.requestRender(editId, { kind: "export", planRevision: getState().revision || state.revision, profile });
        if (!disposed) dispatch({ type: A.RENDER_UPDATED, render: { renderId: res.renderId, kind: "export", profile, planRevision: getState().revision, status: res.cached ? "done" : "queued", pct: res.cached ? 100 : 0 } });
        return { ok: true, ...res };
      } catch (err) {
        return { ok: false, error: err };
      }
    },
    refreshPlan,
    refreshRevisions,
    retrySending: () => queue.resume(),
    select: (selection, opts = {}) => dispatch({ type: A.SELECT, selection, keepPanel: !!opts.keepPanel }),
    clearSelection: () => dispatch({ type: A.SELECT, selection: null }),
    setPanel: (panel) => dispatch({ type: A.SET_PANEL, panel }),
    setAutoUpdate: (value) => { dispatch({ type: A.SET_AUTO_UPDATE, value }); if (value) scheduleAutoUpdate(); },
    openDialog: (type, props = {}) => dispatch({ type: A.OPEN_DIALOG, dialog: { type, props } }),
    closeDialog: () => dispatch({ type: A.CLOSE_DIALOG }),
    toast,
    dismissToast: (id) => dispatch({ type: A.TOAST_DISMISS, id }),
    dismissItemError: (id) => dispatch({ type: A.DISMISS_ITEM_ERROR, id }),
    clearConflict: () => dispatch({ type: A.CLEAR_CONFLICT }),
    onCandidates(fn) { candidateListeners.add(fn); return () => candidateListeners.delete(fn); },
    // Feed watchEdit callbacks here.
    handleSnapshot: (view) => dispatch({ type: A.VIEW_UPDATED, view }),
    handleEvent(evt) {
      if (!evt) return;
      const data = evt.data || {};
      if (evt.type === "render") {
        const prev = getState().render;
        dispatch({ type: A.RENDER_UPDATED, render: { ...data, kind: data.kind || (getState().exportRender?.renderId === data.renderId ? "export" : "preview") } });
        if (data.status === "done" && (data.kind || "preview") === "preview" && prev?.renderId === data.renderId) toast({ tone: "success", message: `Preview updated to r${data.planRevision ?? prev.planRevision}` });
      } else if (evt.type === "plan") {
        if (Number.isInteger(data.headRevision) && data.headRevision > getState().serverRevision) refreshPlan();
      } else if (evt.type === "candidates") {
        for (const fn of [...candidateListeners]) { try { fn(data); } catch { /* listener */ } }
      }
    },
  };

  async function moveHistory(direction) {
    await queue.whenIdle();
    const state = getState();
    const label = direction === "undo" ? state.history.undoLabel : state.history.redoLabel;
    try {
      const res = await (direction === "undo" ? api.undo : api.redo)(editId, { expectedRevision: queue.getRevision() });
      if (disposed) return { ok: false };
      queue.setRevision(res.revision);
      dispatch({ type: A.HISTORY_MOVED, direction, response: res, label });
      toast({ message: `${direction === "undo" ? "Undid" : "Redid"}: ${label || "last change"}` });
      refreshPlan();
      refreshRevisions();
      scheduleAutoUpdate();
      return { ok: true, ...res };
    } catch (err) {
      if (err?.status === 409) refreshPlan();
      return { ok: false, error: err };
    }
  }

  return {
    actions,
    queue,
    dispose() {
      disposed = true;
      if (planTimer !== null) clearTimer(planTimer);
      if (autoTimer !== null) clearTimer(autoTimer);
      queue.dispose();
      candidateListeners.clear();
    },
  };
}
