import { useEffect, useRef, useState } from "react";
import * as editApi from "../../editApi.js";
import {
  A, createEditorStore, createEditorController, createInitialState, useEditorStore, selectShouldAutoUpdate,
  EditorStateCtx, EditorActionsCtx,
} from "../../editState.js";
import { createTimeMap, mapTime, findItem, itemRange, cutForWord, cueForWord, wordAt, opLabel, outDuration, clamp, buildPieces } from "../../editModel.js";
import { playerClock } from "../../playerClock.js";

// EDITOR PROVIDER — owns one edit's editor store, its op queue / controller and the stable action
// object every editor component reads through EditorActionsCtx.
//
// Props: editId (required) · view (latest ProjectView — the initial view, and fed in as it changes)
// · liveView (the session already runs the edit's one watchEdit and re-renders us with every new
// view: SSE-like events are then derived from consecutive views instead of opening a second
// connection) · subscribeEvents(listener) → unsubscribe (alternative: forward raw events) ·
// onNeedAuth(retry). With neither liveView nor subscribeEvents the provider watches the edit itself.
//
// The action object is created once and survives StrictMode's effect replay: it delegates network
// actions to the controller that the load effect creates and disposes, and adds editor-level helpers
// the controller doesn't know about — selection with seek, the transcript word → item mapping
// (UX.md §1d), remove-with-Undo, playback-token media URLs and the time bridge between the plan the
// UI draws and the one revision (or the original take) the player is showing.

const DELEGATED = ["undo", "redo", "requestPreview", "requestExport", "refreshPlan", "refreshRevisions", "retrySending", "setAutoUpdate", "toast", "clearConflict"];

function createMediaStore(editId) {
  const cache = new Map();
  const listeners = new Set();
  let batch = null;
  const tokensNeeded = () => editApi.needsPlaybackTokens() && !editApi.isFixtureMode();
  const keyOf = (kind, key, download) => `${kind}|${key ?? ""}|${download ? 1 : 0}`;
  const emit = () => { for (const fn of [...listeners]) { try { fn(); } catch { /* keep going */ } } };
  const withDownload = (url, download) => (download && url && !url.startsWith("data:") ? `${url}${url.includes("?") ? "&" : "?"}download=1` : url);

  async function fetchTokens(items) {
    const res = await editApi.getPlaybackTokens(editId, items.map(({ kind, key }) => ({ kind, ...(key != null ? { key } : {}) })));
    const exp = Number(res?.expiresAt) || Date.now() + 5 * 60e3;
    return (res?.urls || []).map((u) => {
      const it = items.find((x) => x.kind === u.kind && String(x.key ?? "") === String(u.key ?? "")) || { kind: u.kind, key: u.key };
      const url = withDownload(u.url, it.download);
      cache.set(keyOf(u.kind, u.key, it.download), { url, exp: it.download ? Math.min(exp, Date.now() + 5 * 60e3) : exp });
      return url;
    });
  }

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Synchronous URL (null while a token is on its way).
    get(kind, key = null, download = false) {
      if (!kind) return null;
      if (!tokensNeeded()) return editApi.mediaSrc(editId, kind, key, { download });
      return cache.get(keyOf(kind, key, download))?.url ?? null;
    },
    // Ask for a URL; batched into one POST /playback-token when tokens are needed.
    request(kind, key = null, download = false) {
      if (!kind || !tokensNeeded()) return;
      const hit = cache.get(keyOf(kind, key, download));
      if (hit && hit.exp - Date.now() > 60e3) return;
      if (!batch) {
        batch = [];
        queueMicrotask(() => {
          const items = batch; batch = null;
          fetchTokens(items).then(emit, () => { /* the element shows its fallback */ });
        });
      }
      batch.push({ kind, key, download });
    },
    // Fresh URLs right now (downloads: tokens last 5 minutes).
    async fetchNow(items) {
      if (!tokensNeeded()) return items.map((it) => editApi.mediaSrc(editId, it.kind, it.key, { download: !!it.download }));
      const urls = await fetchTokens(items);
      emit();
      return urls;
    },
  };
}

function createFacade(store, editId) {
  let ctl = null;
  let selSeq = 0;
  let onNeedAuth = null;
  let reloadFn = null;
  let lastReplan = null;
  let autoTimer = null;
  const candidateListeners = new Set();
  const { dispatch, getState } = store;

  let planPieces;
  let planTm = createTimeMap([]);
  // What the player shows: nothing yet, one rendered revision (with that revision's TimeMap), or
  // the original take (source seconds) while "Compare original" is on.
  let shown = { kind: "none", rev: null, tm: null };
  const planTimeMap = () => {
    const p = getState().plan?.timeline?.pieces;
    if (p !== planPieces) { planPieces = p; planTm = createTimeMap(p || []); }
    return planTm;
  };
  const planDuration = () => outDuration(getState().plan) || planTimeMap().outDuration || 0;
  const pieceCache = new Map();

  const f = {
    editId,
    api: editApi,
    getState,
    subscribe: store.subscribe,
    media: createMediaStore(editId),

    attach(controller) {
      ctl = controller;
      controller.actions.onCandidates((d) => { for (const fn of [...candidateListeners]) { try { fn(d); } catch { /* listener */ } } });
    },
    detach(controller) { if (ctl === controller) ctl = null; },
    queue: () => ctl?.queue || null,
    setOnNeedAuth(fn) { onNeedAuth = fn; },
    setReload(fn) { reloadFn = fn; },
    reload() { if (typeof reloadFn === "function") reloadFn(); },
    needAuth(retry) { if (typeof onNeedAuth === "function") onNeedAuth(retry); },

    apply(ops, opts) {
      if (!ctl) return { ok: false, reason: "The edit isn't loaded yet." };
      return ctl.actions.apply(ops, opts);
    },
    select: (selection, opts = {}) => dispatch({ type: A.SELECT, selection, keepPanel: !!opts.keepPanel }),
    clearSelection: () => dispatch({ type: A.SELECT, selection: null }),
    setPanel: (panel) => dispatch({ type: A.SET_PANEL, panel }),
    openDialog: (type, props = {}) => dispatch({ type: A.OPEN_DIALOG, dialog: { type, props } }),
    closeDialog: () => dispatch({ type: A.CLOSE_DIALOG }),
    dismissToast: (id) => dispatch({ type: A.TOAST_DISMISS, id }),
    dismissItemError: (id) => dispatch({ type: A.DISMISS_ITEM_ERROR, id }),
    onCandidates(fn) { candidateListeners.add(fn); return () => candidateListeners.delete(fn); },
    handleSnapshot: (view) => dispatch({ type: A.VIEW_UPDATED, view }),
    handleEvent(evt) { ctl?.actions.handleEvent(evt); },

    // ---- time bridge: the player shows one rendered revision; the UI draws the current plan.
    setShownRevision(rev, pieces) {
      if (!Array.isArray(pieces)) { shown = { kind: "preview", rev, tm: null }; return; }
      pieceCache.set(rev, pieces);
      shown = { kind: "preview", rev, tm: createTimeMap(pieces) };
    },
    setShownSource() { shown = { kind: "source", rev: null, tm: null }; },
    clearShown() { shown = { kind: "none", rev: null, tm: null }; },
    shownKind: () => shown.kind,
    shownRevision: () => shown.rev,
    async piecesForRevision(rev) {
      if (rev == null) return null;
      if (pieceCache.has(rev)) return pieceCache.get(rev);
      const s = getState();
      if (s.serverRevision === rev && s.serverPlan?.timeline?.pieces) return s.serverPlan.timeline.pieces;
      try {
        const p = await editApi.getPlan(editId, { rev });
        const pieces = p?.plan?.timeline?.pieces || null;
        if (pieces) pieceCache.set(rev, pieces);
        return pieces;
      } catch { return getState().plan?.timeline?.pieces || null; }
    },
    // Player seconds → plan output seconds (what the timeline and transcript draw).
    toPlanTime(t) {
      const x = Math.max(0, Number(t) || 0);
      if (shown.kind === "source") return clamp(planTimeMap().srcToOutStart(x), 0, planDuration());
      return shown.tm ? mapTime(shown.tm, planTimeMap(), x) : x;
    },
    // Plan output seconds → player seconds.
    toPreviewTime(p) {
      const x = Math.max(0, Number(p) || 0);
      if (shown.kind === "source") return planTimeMap().outToSrc(x);
      return shown.tm ? mapTime(planTimeMap(), shown.tm, x) : x;
    },
    // Player seconds → source seconds, whatever is showing.
    sourceTimeOf(t) {
      const x = Math.max(0, Number(t) || 0);
      if (shown.kind === "source") return x;
      return (shown.tm || planTimeMap()).outToSrc(x);
    },
    // The same source moment on another revision's output timeline (snaps forward past a cut).
    mapShownTo(t, pieces) {
      const src = f.sourceTimeOf(t);
      if (pieces === "source") return src;
      const tm = createTimeMap(pieces || getState().plan?.timeline?.pieces || []);
      return clamp(tm.srcToOutStart(src), 0, tm.outDuration);
    },
    planTimeMap,
    planDuration,
    seek(planTime) { return playerClock.seek(f.toPreviewTime(clamp(Number(planTime) || 0, 0, planDuration() || Infinity))); },
    planNow: () => f.toPlanTime(playerClock.getTime()),

    // ---- selection (UX.md §1d)
    selectItem(ref, { seek = true, keepPanel = false, source = null, wordKey = null } = {}) {
      if (!ref) { dispatch({ type: A.SELECT, selection: null }); return; }
      const s = getState();
      const item = findItem(s.plan, ref.kind, ref.id);
      dispatch({ type: A.SELECT, selection: { kind: ref.kind, id: ref.id, wordKey: wordKey ?? ref.wordKey ?? null, source, seq: ++selSeq }, keepPanel });
      if (!seek || !item || ref.kind === "music" || ref.kind === "logo") return;
      const r = itemRange(s.plan, ref.kind, item);
      if (r) f.seek(r.outIn + 0.05);
    },
    // Transcript word N → selection by srcWordIndex, never by string match. A cut word selects the
    // cut and seeks to where the cut ends; otherwise the caption cue that carries the word.
    selectWord(i, { source = "transcript", keepPanel = true } = {}) {
      const s = getState();
      const words = s.transcript?.words;
      const w = wordAt(words, i);
      if (!w || !s.plan) return;
      const wordKey = `w${i}`;
      const cut = cutForWord(s.plan, i, words);
      if (cut) {
        f.selectItem({ kind: "cut", id: cut.id }, { wordKey, source, keepPanel, seek: false });
        f.seek(planTimeMap().srcToOutStart(cut.srcOut) + 0.02);
        return;
      }
      const cue = cueForWord(s.plan, i);
      if (cue) f.selectItem({ kind: "caption", id: cue.id }, { wordKey, source, keepPanel, seek: false });
      else dispatch({ type: A.SELECT, selection: { kind: "word", id: wordKey, wordKey, source, seq: ++selSeq }, keepPanel: true });
      f.seek(planTimeMap().srcToOutStart(w.start) + 0.01);
    },

    // Apply an op and offer its inverse as the toast's Undo ("Undid: Remove B-roll #3").
    applyWithUndo(op, inverse, message) {
      const plan = getState().plan;
      const label = opLabel(op, plan);
      const r = f.apply(op, { label });
      if (!r.ok) { f.toast({ tone: "error", message: r.reason }); return r; }
      f.toast({
        message,
        action: {
          label: "Undo",
          onAction: () => {
            const r2 = inverse ? f.apply(inverse, { label: `Undo: ${label}` }) : null;
            if (inverse && !r2.ok) { f.toast({ tone: "error", message: r2.reason }); return; }
            if (!inverse) { f.undo(); return; }
            f.toast({ message: `Undid: ${label}` });
          },
        },
      });
      return r;
    },
    // Delete / Backspace on the selection: remove or turn off, never destroy.
    removeItem(kind, id) {
      const plan = getState().plan;
      const it = findItem(plan, kind, id);
      if (!it) return { ok: false };
      switch (kind) {
        case "broll":
          if (it.status === "removed") return { ok: false };
          return f.applyWithUndo({ type: "broll.remove", id }, { type: "broll.restore", id }, `B-roll #${it.ordinal} removed`);
        case "caption":
          if (it.hidden) return { ok: false };
          return f.applyWithUndo({ type: "caption.hide", cueId: id }, { type: "caption.show", cueId: id }, "Caption hidden");
        case "effect": case "graphic": case "sfx": {
          if (it.enabled === false) return { ok: false };
          const type = `${kind}.toggle`;
          return f.applyWithUndo({ type, id, enabled: false }, { type, id, enabled: true }, opLabel({ type, id, enabled: false }, plan));
        }
        case "cut": {
          const active = f.isCutActive(id);
          return f.applyWithUndo({ type: "cut.toggle", cutId: id, enabled: !active }, { type: "cut.toggle", cutId: id, enabled: active }, active ? "Cut restored — the words are back" : "Cut again");
        }
        case "music":
          if (it.enabled === false) return { ok: false };
          return f.applyWithUndo({ type: "music.remove" }, { type: "music.restore" }, "Music removed");
        case "logo":
          return f.applyWithUndo({ type: "branding.removeLogo" }, it.assetId ? { type: "branding.setLogo", assetId: it.assetId } : null, "Logo removed");
        default:
          return { ok: false };
      }
    },
    isCutActive(cutId) {
      const s = getState();
      if (!s.plan || !findItem(s.plan, "cut", cutId)) return false;
      return buildPieces(s.plan, { words: s.transcript?.words }).activeCutIds.includes(cutId);
    },
    // A revision made outside the op queue (logo upload): move the queue's expected revision, mark
    // the preview stale, pull the plan and history, and let auto-update pick it up.
    externalRevision({ revision, label = "Change", level = "COMPOSITE" } = {}) {
      if (!Number.isInteger(revision)) return;
      const q = ctl?.queue;
      if (q && !q.pending()) q.setRevision(revision);
      dispatch({ type: A.HISTORY_MOVED, direction: "external", label, response: { revision, invalidates: { level, ranges: [[0, planDuration()]] } } });
      f.refreshPlan();
      f.refreshRevisions();
      if (autoTimer !== null) clearTimeout(autoTimer);
      autoTimer = setTimeout(() => { autoTimer = null; if (selectShouldAutoUpdate(getState())) f.requestPreview(); }, 1200);
    },
    noteReplan(from, to) { lastReplan = { from, to }; },
    takeReplan() { const r = lastReplan; lastReplan = null; return r; },
    dispose() { if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null; } },
  };
  for (const name of DELEGATED) {
    f[name] = (...args) => (ctl ? ctl.actions[name](...args) : name === "toast" ? null : Promise.resolve({ ok: false }));
  }
  return f;
}

const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

export default function EditorProvider({ editId, view = null, liveView = false, subscribeEvents = null, onNeedAuth, children }) {
  const [store] = useState(() => createEditorStore(createInitialState({ editId })));
  const [facade] = useState(() => createFacade(store, editId));
  const [initialView] = useState(view);
  const lastView = useRef(null);
  const state = useEditorStore(store);

  useEffect(() => { facade.setOnNeedAuth(onNeedAuth); }, [facade, onNeedAuth]);

  // Load everything the editor needs, and own the controller for this mount.
  useEffect(() => {
    const controller = createEditorController({ editId, api: editApi, store });
    facade.attach(controller);
    const ac = new AbortController();
    let cancelled = false;
    const load = async () => {
      store.dispatch({ type: A.LOAD_START });
      try {
        const [v, plan, transcript, revisions] = await Promise.all([
          initialView ? Promise.resolve(initialView) : editApi.getEdit(editId, { signal: ac.signal }),
          editApi.getPlan(editId, { signal: ac.signal }),
          editApi.getTranscript(editId, { signal: ac.signal }),
          editApi.getRevisions(editId, { signal: ac.signal }).catch(() => null),
        ]);
        if (cancelled) return;
        store.dispatch({ type: A.LOAD_SUCCESS, view: v, plan, transcript, revisions, outline: plan?.outline });
        controller.queue.setRevision(plan?.revision ?? 0);
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        if (err?.status === 401) facade.needAuth(() => { if (!cancelled) load(); });
        store.dispatch({ type: A.LOAD_ERROR, notFound: err?.status === 404, error: { status: err?.status, code: err?.code, message: err?.message, body: err?.body } });
      }
    };
    facade.setReload(load);
    load();
    return () => {
      cancelled = true;
      ac.abort();
      facade.detach(controller);
      facade.dispose();
      controller.dispose();
    };
  }, [editId, store, facade, initialView]);

  // Views from the session. With liveView, the difference to the previous view becomes the events
  // (render progress, plan heads) — fed in before the view itself so a finished render still finds
  // the render it announces and says "Preview updated to rN".
  useEffect(() => {
    if (!view) return;
    if (liveView && typeof subscribeEvents !== "function" && lastView.current) {
      for (const evt of editApi.diffViewEvents(lastView.current, view)) facade.handleEvent(evt);
    }
    lastView.current = view;
    store.dispatch({ type: A.VIEW_UPDATED, view });
  }, [view, store, facade, liveView, subscribeEvents]);

  // Live updates: forwarded events, the session's views, or our own watch.
  useEffect(() => {
    if (typeof subscribeEvents === "function") return subscribeEvents((evt) => facade.handleEvent(evt));
    if (liveView) return undefined;
    const ac = new AbortController();
    editApi.watchEdit(editId, {
      signal: ac.signal,
      onSnapshot: (v) => facade.handleSnapshot(v),
      onEvent: (e) => facade.handleEvent(e),
      onNeedAuth: (retry) => facade.needAuth(retry),
      onNotFound: () => store.dispatch({ type: A.LOAD_ERROR, notFound: true }),
    });
    return () => ac.abort();
  }, [editId, subscribeEvents, liveView, facade, store]);

  // Store-driven side effects: re-plan toasts, auth holds, export completion, back online.
  useEffect(() => {
    let prev = store.getState();
    const unsubscribe = store.subscribe(() => {
      const s = store.getState();
      if (s.warnings !== prev.warnings && s.warnings.length) {
        const re = s.warnings.find((w) => w.code === "REPLANNED");
        if (re) {
          const note = facade.takeReplan();
          const head = note ? `B-roll ${cap(note.from)} → ${cap(note.to)}` : "Re-planned";
          const kept = Number(re.keptUserChanges) || 0;
          facade.toast({ message: `${head} · added ${Number(re.added) || 0}${re.removed ? ` · removed ${re.removed}` : ""} · kept your ${kept} ${kept === 1 ? "change" : "changes"}`, action: { label: "Undo", onAction: () => facade.undo() } });
        }
        const nb = s.warnings.find((w) => w.code === "NO_BROLL_FOUND");
        if (nb) facade.toast({ tone: "warn", title: "NO B-ROLL FOUND", message: nb.message || "Nothing new fit this line." });
      }
      if (s.queue.state === "auth" && prev.queue.state !== "auth") facade.needAuth(() => facade.retrySending());
      const ex = s.exportRender;
      if (ex && ex.status === "done" && !(prev.exportRender?.status === "done" && prev.exportRender?.renderId === ex.renderId)) {
        Promise.all([editApi.getExports(editId), editApi.getRender(editId, ex.renderId).catch(() => null)])
          .then(([exports, full]) => {
            store.dispatch({ type: A.EXPORTS_LOADED, exports });
            if (full) store.dispatch({ type: A.RENDER_UPDATED, render: { ...full, kind: "export" } });
          }, () => { /* the dialog offers a retry */ });
      }
      prev = s;
    });
    const online = () => { if (store.getState().queue.state === "offline") facade.retrySending(); };
    window.addEventListener("online", online);
    return () => { unsubscribe(); window.removeEventListener("online", online); };
  }, [store, facade, editId]);

  return (
    <EditorActionsCtx.Provider value={facade}>
      <EditorStateCtx.Provider value={state}>{children}</EditorStateCtx.Provider>
    </EditorActionsCtx.Provider>
  );
}
