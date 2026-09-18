import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import StageChecklist from "../../components/StageChecklist.jsx";
import ProgressBar from "../../components/ProgressBar.jsx";
import Dialog from "../../components/Dialog.jsx";
import EditNotice from "../../components/EditNotice.jsx";
import { PanelHead } from "../AdminShared.jsx";
import { cancelEdit, retryEdit, deleteEdit, mediaSrc } from "../../editApi.js";
import { removeRecent } from "../../recentEdits.js";
import {
  stageRows, queueLine, fmtEta, smoothEta, discoveryLines, noticeForView, noticeCopy, errorCopy, isAnalyzing, isEditable, fmtBytes,
} from "../../editFormat.js";

// SC 02 · THE READ (UX.md §1c, §1f). While the take is analyzed: the call sheet of stages on the
// left, and on the right what the AI crew has heard so far, filling in as it lands. The same screen
// carries every way analysis can stop (transcription failed, no speech, providers down, stopped by
// you) as a failure card with the actions that fix it, and the READY beat before the editor opens.

const EASE = [0.16, 1, 0.3, 1];

// Failure-card action → POST /:id/retry body.
const RETRY_BODY = {
  retry: { mode: "resume" },
  restart: { mode: "resume" },
  continueWithoutCaptions: { mode: "resume", continueWithout: "transcript" },
  continueWithoutTranscript: { mode: "resume", continueWithout: "transcript" },
};

// The dark page every AI Edit session state sits on (App marks aiEdit as a dark page).
export function DarkStage({ children, glow = "rgba(35,200,224,.20)", maxWidth = 1120, busy }) {
  return (
    <div aria-busy={busy || undefined} style={{ background: "var(--color-dark)", color: "var(--color-dark-ink)", marginTop: -90, paddingTop: 90, position: "relative", overflow: "hidden", minHeight: "100dvh" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(ellipse 70% 55% at 50% 110%, ${glow}, transparent 65%)` }} />
      <div style={{ position: "relative", maxWidth, margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,60px) 100px" }}>
        {children}
      </div>
    </div>
  );
}

export default function AiEditAnalyzing({ edit, ready = false, connection = "ok", onRefresh, onList, onNew }) {
  const reduce = useReducedMotion();
  const id = edit.id;
  const status = edit.status;
  const analyzing = isAnalyzing(status);
  const emptyTranscript = isEditable(status) && edit.discoveries?.words === 0 && !edit.plan;
  const notice = noticeForView(edit) || (emptyTranscript ? noticeCopy("NO_SPEECH") : null);
  const stopped = !analyzing && !ready;
  const rows = stageRows(emptyTranscript ? { ...edit, status: "NEEDS_ATTENTION", statusReason: { stage: "TRANSCRIBING" } } : edit);
  const currentRow = rows.find((r) => r.state === "current");
  const pct = ready ? 100 : Math.round(edit.progress?.overallPct ?? edit.overallPct ?? 0);
  const queuePos = analyzing ? edit.progress?.queuePosition ?? 0 : 0;

  // ETA: never 0, never jumps up by more than 20 % per update (smoothEta), derived per new server value.
  const rawEta = analyzing ? edit.progress?.etaSec ?? null : null;
  const [eta, setEta] = useState(() => ({ raw: rawEta, shown: smoothEta(null, rawEta) }));
  if (eta.raw !== rawEta) setEta({ raw: rawEta, shown: rawEta == null ? null : smoothEta(eta.shown, rawEta) });
  const etaText = analyzing && !queuePos ? fmtEta(eta.shown) : "";

  const [dialog, setDialog] = useState(null); // "stop" | "delete" | null
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const keepRef = useRef(null);
  const cancelDeleteRef = useRef(null);

  const allowed = Array.isArray(edit.allowedActions) ? edit.allowedActions : null;
  const can = (a) => !allowed || allowed.includes(a);
  const actions = (notice?.actions || []).filter((a) => {
    if (RETRY_BODY[a.id]) return can("retry");
    if (a.id === "delete") return can("delete");
    if (a.id === "stop") return analyzing && can("cancel");
    return true;
  });

  const run = async (key, fn) => {
    setBusyAction(key);
    setActionError(null);
    try {
      await fn();
      await onRefresh?.();
      return true;
    } catch (err) {
      setActionError(errorCopy(err));
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const onNoticeAction = (actionId) => {
    if (RETRY_BODY[actionId]) { run(actionId, () => retryEdit(id, RETRY_BODY[actionId])); return; }
    if (actionId === "delete") { setActionError(null); setDialog("delete"); return; }
    if (actionId === "stop") { setActionError(null); setDialog("stop"); return; }
    if (actionId === "uploadAnother") { onNew?.(); return; }
    if (actionId === "list") onList?.();
  };

  const confirmStop = async () => {
    setBusyAction("stop");
    setActionError(null);
    try {
      await cancelEdit(id, { target: "pipeline" });
    } catch (err) {
      if (err?.code !== "NOTHING_TO_CANCEL") {
        setActionError(errorCopy(err));
        setBusyAction(null);
        return;
      }
    }
    setBusyAction(null);
    setDialog(null);
    onRefresh?.();
  };

  const confirmDelete = async () => {
    setBusyAction("delete");
    setActionError(null);
    try {
      await deleteEdit(id);
    } catch (err) {
      if (err?.status !== 404) {
        setActionError(errorCopy(err));
        setBusyAction(null);
        return;
      }
    }
    removeRecent(id);
    setBusyAction(null);
    setDialog(null);
    onList?.();
  };

  const closeDialog = () => { if (!busyAction) { setDialog(null); setActionError(null); } };

  const source = edit.source || null;
  const lines = discoveryLines(edit.discoveries, source);
  const poster = edit.posterUrl ? mediaSrc(id, "poster") : null;
  const posterRatio = source?.width && source?.height ? `${source.width} / ${source.height}` : edit.orientation === "horizontal" ? "16 / 9" : edit.orientation === "square" ? "1 / 1" : "9 / 16";
  const horizontal = source?.width > source?.height;

  const head = ready
    ? ["● READY", "var(--color-lm)"]
    : status === "CANCELLED" ? ["● STOPPED", "var(--color-dark-dim)"]
      : !analyzing ? ["● CUT", "#ff6a3c"]
        : queuePos ? ["● IN LINE", "var(--color-am)"] : [`● ANALYZING ${pct}%`, "var(--color-cy)"];

  const announce = ready ? "Your edit is ready" : analyzing && currentRow ? `Now: ${currentRow.label.toLowerCase()} — ${currentRow.sub}` : "";
  const rise = (delay = 0) => (reduce ? {} : { initial: { opacity: 0, y: 28 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: EASE, delay } });
  const failedHeadline = stopped || emptyTranscript;

  return (
    <DarkStage glow={ready ? "rgba(185,242,74,.18)" : failedHeadline ? "rgba(216,39,27,.22)" : "rgba(35,200,224,.20)"}>
      <span className="scene-pill" style={{ "--tagc": "#23c8e0" }}>SC 02 · THE READ</span>
      <h1 className="headline on-dark" style={{ fontSize: "clamp(32px,5vw,64px)" }}>
        {ready
          ? <>That's a <span style={{ color: "var(--color-lm)" }}>cut.</span></>
          : failedHeadline
            ? <>The take got <span style={{ color: "var(--color-rec)" }}>cut.</span></>
            : <>Watching your <span style={{ color: "var(--color-cy)" }}>take.</span></>}
      </h1>
      <p style={{ marginTop: 14, maxWidth: 620, fontSize: 15, lineHeight: 1.6, color: "var(--color-dark-dim)" }}>
        <strong style={{ color: "var(--color-dark-ink)", fontWeight: 700 }}>{edit.title || source?.displayName || "Your take"}</strong>
        {source?.displayName && source.displayName !== edit.title ? ` · ${source.displayName}` : ""}
        {source?.sizeBytes ? ` · ${fmtBytes(source.sizeBytes)}` : ""}
      </p>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announce}</span>

      {notice && (
        <motion.div {...rise(0)} style={{ marginTop: 26 }}>
          {/* UX.md §1f: every blocking state here is a dark card with a rec spine and role="alert". */}
          <EditNotice notice={notice} tone="error" actions={actions} onAction={onNoticeAction} busyAction={busyAction && busyAction !== "stop" && busyAction !== "delete" ? busyAction : null}>
            {actionError && !dialog && (
              <p role="alert" style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.55, color: "#ff6a3c" }}>{actionError.body}</p>
            )}
          </EditNotice>
        </motion.div>
      )}

      <div data-demo-grid="1" style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 20, marginTop: notice ? 20 : 34, alignItems: "start" }}>
        {/* ---------- left: the call sheet ---------- */}
        {/* Keep the panel head on one line at phone width: the status stays whole, the title truncates. */}
        <style href="kf-ai-edit-read" precedence="kf">{".kf-fit-head .editor-head{flex-wrap:nowrap;min-width:0}.kf-fit-head .editor-head>span{flex-shrink:0}.kf-fit-head .editor-head>span:nth-child(4){flex-shrink:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kf-fit-head .editor-status{white-space:nowrap;padding-left:10px}"}</style>
        <motion.section {...rise(0.04)} className="editor-card kf-fit-head" aria-labelledby="kf-an-sheet" style={{ minWidth: 0 }}>
          <h2 id="kf-an-sheet" className="sr-only">Analysis progress</h2>
          <PanelHead title="KEYFRAME — THE READ" status={head[0]} statusColor={head[1]} />
          <div style={{ padding: "clamp(16px,2.4vw,24px)", display: "grid", gap: 18 }}>
            <StageChecklist rows={rows} />

            <div style={{ display: "grid", gap: 10 }}>
              <ProgressBar value={pct} label="Analysis" valueText={ready ? "READY" : `ANALYZING ${pct}%${etaText ? ` · ${etaText}` : ""}`} announce={analyzing} />
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: "var(--color-dark-ink)" }}>
                  {ready ? "READY ✓" : analyzing ? (queuePos ? queueLine(queuePos) : `${pct}% · ${edit.progress?.message || currentRow?.label || "WORKING"}`) : `STOPPED AT ${pct}%`}
                </span>
                {etaText && <span style={{ color: "var(--color-dark-dim)" }}>TIME LEFT · <span style={{ color: "var(--color-dark-ink)", textTransform: "none", letterSpacing: "0.04em", fontSize: 12 }}>{etaText}</span></span>}
              </div>
              {connection === "lost" && analyzing && (
                <span role="status" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-am)" }}>SIGNAL WEAK — RECONNECTING…</span>
              )}
            </div>

            {analyzing && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px 16px", flexWrap: "wrap", paddingTop: 14, borderTop: "1px solid rgba(242,237,226,.08)" }}>
                <p style={{ margin: 0, flex: "1 1 260px", fontSize: 13, lineHeight: 1.55, color: "var(--color-dark-dim)" }}>
                  You can close this tab — we'll keep working. It'll be in{" "}
                  <button type="button" onClick={onList} style={{ padding: 0, border: 0, background: "none", cursor: "pointer", font: "inherit", fontWeight: 700, color: "var(--color-dark-ink)", textDecoration: "underline", textDecorationColor: "var(--color-mag)", textUnderlineOffset: 3 }}>
                    My edits
                  </button>.
                </p>
                {can("cancel") && (
                  <button type="button" className="link-mono on-dark" onClick={() => { setActionError(null); setDialog("stop"); }} style={{ minHeight: 44 }}>
                    Stop analyzing
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.section>

        {/* ---------- right: what we're hearing ---------- */}
        <motion.section {...rise(0.1)} className="editor-card" aria-labelledby="kf-an-heard" style={{ minWidth: 0 }}>
          <div className="editor-head">
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: analyzing ? "var(--color-rec)" : ready ? "var(--color-lm)" : "var(--color-dark-mono)", animation: analyzing ? "kf2-blink 1.1s steps(1) infinite" : "none" }} />
            <h2 id="kf-an-heard" style={{ margin: 0, fontFamily: "var(--font-mono)", fontWeight: 400, fontSize: 10, letterSpacing: "0.2em", color: "var(--color-dark-dim)" }}>WHAT WE'RE HEARING</h2>
            {analyzing && (
              <span className="meter" aria-hidden="true" style={{ marginLeft: "auto", height: 14 }}><span /><span /><span /><span /></span>
            )}
          </div>
          <div style={{ padding: "clamp(16px,2.4vw,22px)", display: "grid", gap: 16 }}>
            <div aria-hidden="true" style={{ position: "relative", display: "grid", placeItems: "center", height: "clamp(150px,22vw,220px)", borderRadius: 12, overflow: "hidden", background: "var(--color-dark-2)" }}>
              <div style={{ position: "relative", aspectRatio: posterRatio, ...(horizontal ? { width: "88%" } : { height: "86%" }), maxWidth: "88%", maxHeight: "86%", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(242,237,226,.14)" }}>
                {poster
                  ? <img src={poster} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div className="film-drift" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #23c8e0, #10505c 55%, #081f24)", opacity: 0.8 }} />}
                <div className="film-scan" style={{ opacity: 0.3 }} />
              </div>
              <span style={{ position: "absolute", top: 10, left: 12, display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,.85)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff4d3c", animation: analyzing ? "kf2-blink 1s steps(1) infinite" : "none" }} />
                {analyzing ? "PLAYBACK" : ready ? "PRINTED" : "HOLD"}
              </span>
            </div>

            <ul aria-label="Findings so far" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.li
                    key={l.key}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    style={{ minWidth: 0 }}
                  >
                    {l.chips ? (
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <span className="sr-only">Topics: </span>
                        {l.chips.map((c) => (
                          <span key={c} className="chip-c" style={{ "--chipc": "var(--color-cy)", cursor: "default", padding: "5px 10px" }}>{c}</span>
                        ))}
                      </span>
                    ) : l.prose ? (
                      <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(16px,1.8vw,19px)", lineHeight: 1.35, letterSpacing: "-0.01em", color: "var(--color-dark-ink)", paddingLeft: 12, borderLeft: "2px solid var(--color-mag)" }}>
                        {l.text}
                      </span>
                    ) : (
                      <span style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: l.key === "face" && l.text.endsWith("✓") ? "var(--color-lm)" : "var(--color-dark-ink)", fontVariantNumeric: "tabular-nums" }}>
                        <span aria-hidden="true" style={{ width: 14, height: 1, background: "rgba(242,237,226,.3)", flexShrink: 0 }} />
                        {l.text}
                      </span>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
              {analyzing && (
                <li style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--color-dark-dim)" }}>
                  <span aria-hidden="true" style={{ width: 14, height: 1, background: "rgba(242,237,226,.16)" }} />
                  {lines.length <= 1 ? "LISTENING…" : "STILL LISTENING…"}
                </li>
              )}
            </ul>
          </div>
        </motion.section>
      </div>

      <Dialog
        open={dialog === "stop"}
        onClose={closeDialog}
        dismissable={busyAction !== "stop"}
        title="Stop analyzing?"
        description="Your upload is kept — restart any time without uploading again."
        initialFocusRef={keepRef}
        width={480}
        actions={(
          <>
            <button ref={keepRef} type="button" className="btn-outline-dark btn-sm" onClick={closeDialog} disabled={busyAction === "stop"} style={{ minHeight: 44 }}>Keep analyzing</button>
            <button type="button" className="btn-ink on-dark" onClick={confirmStop} disabled={busyAction === "stop"} aria-busy={busyAction === "stop" || undefined} style={{ minHeight: 44 }}>
              {busyAction === "stop" ? "Stopping…" : "Stop analyzing"}
            </button>
          </>
        )}
      >
        {actionError && dialog === "stop" && <p role="alert" style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#ff6a3c" }}>{actionError.body}</p>}
      </Dialog>

      <Dialog
        open={dialog === "delete"}
        onClose={closeDialog}
        dismissable={busyAction !== "delete"}
        title={<>Delete <em>{edit.title || "this edit"}</em>?</>}
        description="The upload, edit and exports are removed. This can't be undone."
        initialFocusRef={cancelDeleteRef}
        width={480}
        actions={(
          <>
            <button ref={cancelDeleteRef} type="button" className="btn-outline-dark btn-sm" onClick={closeDialog} disabled={busyAction === "delete"} style={{ minHeight: 44 }}>Keep it</button>
            <button type="button" className="btn-ink" onClick={confirmDelete} disabled={busyAction === "delete"} aria-busy={busyAction === "delete" || undefined} style={{ minHeight: 44, background: "var(--color-rec)", color: "#fff" }}>
              {busyAction === "delete" ? "Deleting…" : "Delete edit"}
            </button>
          </>
        )}
      >
        {actionError && dialog === "delete" && <p role="alert" style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#ff6a3c" }}>{actionError.body}</p>}
      </Dialog>
    </DarkStage>
  );
}
