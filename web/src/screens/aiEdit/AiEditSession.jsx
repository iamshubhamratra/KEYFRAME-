import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import AiEditor from "./AiEditor.jsx";
import AiEditAnalyzing, { DarkStage } from "./AiEditAnalyzing.jsx";
import EditorErrorBoundary from "../../components/EditorErrorBoundary.jsx";
import EditNotice from "../../components/EditNotice.jsx";
import { watchEdit, getEdit, EDIT_ID_RE } from "../../editApi.js";
import { isAnalyzing, isEditable, noticeCopy, UPLOAD_COPY } from "../../editFormat.js";
import { pushRecent, removeRecent } from "../../recentEdits.js";
import { acknowledgeStarted } from "../../uploadStore.js";

// ONE AI EDIT, for as long as it's open (UX.md §1c–§1f, §4.3, §4.5). Owns the edit's single live
// connection (watchEdit: SSE, falling back to polling) and routes on what the server says:
//   loading → analyzing (QUEUED / PROCESSING) → READY beat (900 ms) → editor
//   NEEDS_ATTENTION / FAILED / CANCELLED → failure card · 404 → not found · 401 → log in.
// Lives at /edits/<id>, so a refresh or shared link comes straight back.

const HANDOFF_MS = 900;
const EASE = [0.16, 1, 0.3, 1];

export default function AiEditSession({ editId, onList, onNew, onNeedAuth, onOpen }) {
  const reduce = useReducedMotion();
  const validId = typeof editId === "string" && EDIT_ID_RE.test(editId);
  const [view, setView] = useState(null);
  const [missing, setMissing] = useState(false);
  const [authRetry, setAuthRetry] = useState(null);
  const [connection, setConnection] = useState("ok");
  const [sawAnalysis, setSawAnalysis] = useState(false);
  const [handoffDone, setHandoffDone] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [watchKey, setWatchKey] = useState(0);
  const alive = useRef(false);

  // The editor rides this session's stream instead of opening a second one: EditorProvider takes
  // subscribeEvents(listener) → unsubscribe and receives every {type, data} event watchEdit sees.
  const [eventListeners] = useState(() => new Set());
  const subscribeEvents = useCallback((fn) => {
    eventListeners.add(fn);
    return () => { eventListeners.delete(fn); };
  }, [eventListeners]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // The one live connection for this edit.
  useEffect(() => {
    if (!validId) return undefined;
    const ac = new AbortController();
    let remembered = false;
    watchEdit(editId, {
      signal: ac.signal,
      onEvent: (evt) => {
        for (const fn of [...eventListeners]) {
          try { fn(evt); } catch { /* one broken listener must not stop the stream */ }
        }
      },
      onSnapshot: (v) => {
        if (!v) return;
        setView(v);
        setConnection("ok");
        setAuthRetry(null);
        if (isAnalyzing(v.status)) setSawAnalysis(true);
        if (!remembered && v.id) { remembered = true; pushRecent(v.id, { title: v.title }); }
      },
      onNotFound: () => { removeRecent(editId); setMissing(true); },
      onNeedAuth: (retry) => setAuthRetry(() => retry),
      onError: () => setConnection("lost"),
    });
    // The upload page handed this edit over; the upload store can go back to idle.
    acknowledgeStarted(editId);
    return () => ac.abort();
  }, [editId, validId, watchKey, eventListeners]);

  const notFound = !validId || missing;

  // READY after watching the analysis: hold "That's a cut." for a beat, then open the editor.
  const editable = !!view && isEditable(view.status);
  const emptyTranscript = editable && view.discoveries?.words === 0 && !view.plan;
  const showHandoff = editable && !emptyTranscript && sawAnalysis && !handoffDone;
  useEffect(() => {
    if (!showHandoff) return undefined;
    const t = setTimeout(() => setHandoffDone(true), HANDOFF_MS);
    return () => clearTimeout(t);
  }, [showHandoff]);

  // Pull the full view right after an action (retry, stop) instead of waiting for the next event.
  const refresh = useCallback(async () => {
    if (!validId) return;
    try {
      const v = await getEdit(editId);
      if (!alive.current || !v) return;
      setView(v);
      if (isAnalyzing(v.status)) setSawAnalysis(true);
    } catch (err) {
      if (!alive.current) return;
      if (err?.status === 404) { removeRecent(editId); setMissing(true); }
      // Signed out: after login, reconnect the live watcher (it reloads the full view).
      else if (err?.status === 401) setAuthRetry(() => () => setWatchKey((k) => k + 1));
    }
  }, [editId, validId]);

  const logIn = () => {
    const retry = authRetry;
    onNeedAuth?.(() => {
      if (alive.current) { setAuthRetry(null); retry?.(); return; }
      // Auth replaced this screen, so the watcher is gone: come back to this edit.
      onOpen?.(editId);
    });
  };

  let content;
  let key;
  if (notFound) {
    key = "missing";
    content = (
      <DarkStage glow="rgba(216,39,27,.18)" maxWidth={760}>
        <span className="scene-pill" style={{ "--tagc": "#d8271b" }}>AI EDIT · 404</span>
        <h1 className="headline on-dark" style={{ fontSize: "clamp(30px,4.6vw,56px)" }}>Nothing in <span style={{ color: "var(--color-rec)" }}>the can.</span></h1>
        <div style={{ marginTop: 28 }}>
          <EditNotice notice={noticeCopy("NOT_FOUND")} onAction={() => onList?.()} focusOnMount />
        </div>
      </DarkStage>
    );
  } else if (!view && authRetry) {
    key = "auth";
    content = (
      <DarkStage glow="rgba(255,176,58,.16)" maxWidth={760}>
        <span className="scene-pill" style={{ "--tagc": "#ffb03a" }}>AI EDIT · SIGNED OUT</span>
        <h1 className="headline on-dark" style={{ fontSize: "clamp(30px,4.6vw,56px)" }}>Back on <span style={{ color: "var(--color-am)" }}>set?</span></h1>
        <div style={{ marginTop: 28 }}>
          <EditNotice title="SIGNED OUT" body={UPLOAD_COPY.sessionEnded} tone="warn" actions={[{ id: "login", label: "Log in", primary: true }, { id: "list", label: "← My edits" }]} onAction={(a) => (a === "login" ? logIn() : onList?.())} />
        </div>
      </DarkStage>
    );
  } else if (!view) {
    key = "loading";
    content = (
      <DarkStage busy maxWidth={760}>
        <span className="scene-pill" style={{ "--tagc": "#23c8e0" }}>AI EDIT</span>
        <p role="status" className="rec-blip" style={{ marginTop: 26, fontSize: 11 }}>PULLING THE TAKE…</p>
        <div aria-hidden="true" className="editor-card" style={{ marginTop: 22, height: 220, position: "relative" }}>
          <div className="film-scan" style={{ opacity: 0.35 }} />
        </div>
      </DarkStage>
    );
  } else if (view.status === "DELETING") {
    key = "deleting";
    content = (
      <DarkStage maxWidth={760}>
        <span className="scene-pill" style={{ "--tagc": "#7d766a" }}>AI EDIT</span>
        <div style={{ marginTop: 28 }}>
          <EditNotice title="DELETING" body="This edit is being removed — the upload, edit and exports go with it." tone="info" actions={[{ id: "list", label: "← My edits", primary: true }]} onAction={() => onList?.()} />
        </div>
      </DarkStage>
    );
  } else if (editable && !showHandoff && !emptyTranscript) {
    key = "editor";
    content = (
      <EditorErrorBoundary resetKeys={[editId]} onReset={() => setEditorKey((k) => k + 1)} onList={onList}>
        <AiEditor key={editorKey} edit={view} onNeedAuth={onNeedAuth} onList={onList} onNew={onNew} subscribeEvents={subscribeEvents} />
      </EditorErrorBoundary>
    );
  } else {
    key = "read";
    content = (
      <AiEditAnalyzing edit={view} ready={showHandoff} connection={connection} onRefresh={refresh} onList={onList} onNew={onNew} />
    );
  }

  return (
    <>
      {view && authRetry && (
        <div role="alert" style={{ position: "fixed", zIndex: 60, left: 16, right: 16, top: 78, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div className="editor-card" style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "10px 12px 10px 18px", borderRadius: 14, maxWidth: 560 }}>
            <span style={{ fontSize: 14, color: "var(--color-dark-ink)" }}>{UPLOAD_COPY.sessionEnded}</span>
            <button type="button" className="btn-ink on-dark" onClick={logIn} style={{ minHeight: 44 }}>Log in</button>
          </div>
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
