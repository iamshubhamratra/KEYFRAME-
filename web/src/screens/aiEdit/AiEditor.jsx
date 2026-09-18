import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import EditorProvider from "./EditorProvider.jsx";
import VideoPreview from "./VideoPreview.jsx";
import PlayerControls from "./PlayerControls.jsx";
import Timeline from "./Timeline.jsx";
import SummaryChips from "./SummaryChips.jsx";
import InspectorTabs from "./InspectorTabs.jsx";
import ExportDialog from "./ExportDialog.jsx";
import ShortcutsDialog from "./ShortcutsDialog.jsx";
import TranscriptPanel, { CutCard } from "./panels/TranscriptPanel.jsx";
import BrollReplaceDialog from "./panels/BrollReplaceDialog.jsx";
import ReframeDialog from "./panels/ReframeDialog.jsx";
import { CueCard } from "./panels/CaptionsPanel.jsx";
import { BrollCard } from "./panels/BrollPanel.jsx";
import { EffectCard, GraphicCard } from "./panels/EffectsPanel.jsx";
import { MusicCard, SfxCard } from "./panels/AudioPanel.jsx";
import { LogoCard } from "./panels/BrandingPanel.jsx";
import { SegmentCard } from "./panels/FormatPanel.jsx";
import Dialog from "../../components/Dialog.jsx";
import Switch from "../../components/Switch.jsx";
import Toasts from "../../components/Toasts.jsx";
import EditNotice from "../../components/EditNotice.jsx";
import { useEditor, useEditorActions, selectPendingChanges, selectPreviewEstimate, PANEL_FOR_KIND } from "../../editState.js";
import { outDuration, neighborItem, kindOfId } from "../../editModel.js";
import { lengthLine, previewStatusLine, editorNotices, noticeCopy, itemHead, errorCopy } from "../../editFormat.js";
import { matchShortcut, ariaKeyshortcuts } from "../../shortcuts.js";
import { playerClock } from "../../playerClock.js";

// SC 03 · THE EDIT BAY (UX.md §1d, §2, §4.9) — the editor opens with the AI's edit already applied.
// ≥1280 px: Transcript & Cuts | preview, summary chips, timeline | Inspector. 860–1279: centre |
// Inspector (Transcript first). <860: one column with a sticky preview and item actions in a bottom
// sheet. A fixed bar carries the transport, "Update preview (~20s)" and Export. Changes go through
// the op queue (optimistic where OP_META says); the preview is always a real render and pending
// changes are marked, never faked; auto-update asks for a render 1.2 s after the last change when
// it's cheap enough (≤45 s) or audio-only. Keyboard: shortcuts.js through one keydown listener.

const CSS = `
.kf-ed{--kf-bar-h:78px;--kf-stage-max:min(58dvh,720px);position:relative;background:var(--color-dark);color:var(--color-dark-ink);margin-top:-90px;padding-top:90px;min-height:100dvh}
.kf-ed::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 38% at 50% 0%,rgba(232,50,168,.09),transparent 70%)}
.kf-ed-wrap{position:relative;max-width:1720px;margin:0 auto;padding:clamp(10px,1.6vw,22px) clamp(16px,2.2vw,32px) calc(var(--kf-bar-h) + 40px)}
.kf-ed-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px 24px;padding-bottom:16px;border-bottom:1px solid var(--color-dark-line)}
.kf-ed-headmain{min-width:0;flex:1 1 380px}
.kf-ed-title{display:block;box-sizing:border-box;width:100%;max-width:760px;min-height:44px;margin:10px 0 0 -8px;padding:2px 8px;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--color-dark-ink);font-family:var(--font-display);font-weight:800;letter-spacing:-.02em;font-size:clamp(24px,2.6vw,36px);line-height:1.15;text-overflow:ellipsis}
.kf-ed-title:hover{border-color:rgba(242,237,226,.14)}
.kf-ed-title:focus{border-color:rgba(232,50,168,.55);background:rgba(242,237,226,.03);outline:none}
.kf-ed-tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.kf-ed-grid{display:grid;gap:18px;margin-top:18px;grid-template-columns:minmax(0,1fr);align-items:start}
.kf-ed-col{min-width:0}
.kf-ed-center{display:grid;gap:16px;min-width:0}
.kf-ed-scroll{overflow:auto;overscroll-behavior:contain;min-height:0;flex:1;padding:16px}
.kf-ed-bar{position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(13,11,7,.93);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid rgba(242,237,226,.12);padding-bottom:env(safe-area-inset-bottom)}
.kf-ed-bar-in{max-width:1720px;margin:0 auto;padding:10px clamp(12px,2.2vw,32px);display:flex;align-items:center;gap:12px}
.kf-ed-bar-actions{display:flex;align-items:center;gap:10px;flex-shrink:0}
.kf-item-card{scroll-margin:96px 0 calc(var(--kf-bar-h) + 24px)}
@media (min-width:860px){
  .kf-ed-grid{grid-template-columns:minmax(0,1fr) 400px}
  .kf-ed-side{position:sticky;top:84px;max-height:calc(100dvh - 84px - var(--kf-bar-h) - 20px);display:flex;flex-direction:column;overflow:hidden}
}
@media (min-width:1280px){.kf-ed-grid{grid-template-columns:340px minmax(0,1fr) 380px}}
@media (max-width:859px){
  .kf-ed{--kf-bar-h:160px;--kf-stage-max:40dvh}
  .kf-ed-stage{position:sticky;top:72px;z-index:6;padding:6px 0 8px;background:linear-gradient(var(--color-dark) 88%,transparent)}
  .kf-ed-bar-in{flex-wrap:wrap;row-gap:4px;padding-top:4px;padding-bottom:8px}
  .kf-ed-bar-actions{flex:1 1 100%}
  .kf-ed-bar-actions>button{flex:1}
  .kf-item-card{scroll-margin:46dvh 0 calc(var(--kf-bar-h) + 24px)}
}
`;

// ---------------------------------------------------------------- environment stores
function mediaQueryStore(query) {
  return {
    subscribe(cb) {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    get: () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : true),
  };
}
const WIDE = mediaQueryStore("(min-width: 1280px)");
const MEDIUM = mediaQueryStore("(min-width: 860px)");
const subscribeOnline = (cb) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};
const getOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

const WIDE_TABS = ["captions", "broll", "effects", "audio", "branding", "format"];
const ALL_TABS = ["transcript", ...WIDE_TABS];

// ---------------------------------------------------------------- small pieces
function TitleField({ value, onSave }) {
  const id = useId();
  const [draft, setDraft] = useState({ base: value, text: value });
  if (draft.base !== value) setDraft({ base: value, text: value });
  const save = () => {
    const t = draft.text.trim();
    if (!t) { setDraft({ base: value, text: value }); return; }
    if (t !== value) { const r = onSave(t); if (r && r.ok === false) setDraft({ base: value, text: value }); }
  };
  return (
    <>
      <label htmlFor={id} className="sr-only">Edit title</label>
      <input
        id={id}
        className="kf-ed-title"
        value={draft.text}
        maxLength={80}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setDraft({ base: value, text: e.target.value })}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
          else if (e.key === "Escape") { e.preventDefault(); setDraft({ base: value, text: value }); }
        }}
      />
    </>
  );
}

function ConfirmDialog({ title, body, confirmLabel = "Confirm", ops = [], toast, onClose }) {
  const f = useEditorActions();
  const confirmRef = useRef(null);
  const [error, setError] = useState(null);
  const confirm = () => {
    const r = f.apply(ops);
    if (!r.ok) { setError(r.reason); return; }
    if (toast) f.toast({ message: toast });
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={body}
      width={500}
      initialFocusRef={confirmRef}
      actions={
        <>
          <button type="button" className="btn-outline-dark btn-sm" onClick={onClose} style={{ minHeight: 44 }}>Cancel</button>
          <button type="button" ref={confirmRef} className="btn-ink on-dark" onClick={confirm} style={{ minHeight: 44 }}>{confirmLabel}</button>
        </>
      }
    >
      {error ? <p role="alert" style={{ margin: 0, fontSize: 14, color: "#ff6a3c" }}>{error}</p> : null}
    </Dialog>
  );
}

function QaDialog({ onClose }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const summary = useEditor((s) => s.view?.qaSummary);
  const findings = plan?.qa?.findings || [];
  return (
    <Dialog open onClose={onClose} scene="CHECKING THE CUT" title="Quality check" description={summary?.headline} width={560}>
      {findings.length ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {findings.map((x, i) => {
            const kind = x.elementId ? kindOfId(plan, x.elementId) : null;
            return (
              <li key={`${x.elementId || "f"}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--color-dark-line)" }}>
                <span aria-hidden="true" style={{ color: x.severity === "warn" ? "var(--color-am)" : "#ff6a3c" }}>⚠</span>
                <span style={{ flex: "1 1 220px", fontSize: 14, lineHeight: 1.5, color: "var(--color-dark-ink)" }}>
                  <span className="sr-only">{x.severity}: </span>{x.detail}
                </span>
                {kind && (
                  <button type="button" className="btn-outline-dark btn-sm" style={{ minHeight: 44 }} onClick={() => { onClose(); f.selectItem({ kind, id: x.elementId }, { source: "qa" }); }}>
                    Show
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p style={{ margin: 0, fontSize: 14, color: "var(--color-dark-dim)" }}>No issues in the last check.</p>}
    </Dialog>
  );
}

function ItemSheet({ kind, id, onClose }) {
  const plan = useEditor((s) => s.plan);
  const head = itemHead({ kind, id }, plan) || "Item";
  const props = { id, layout: "narrow" };
  const card = kind === "broll" ? <BrollCard {...props} />
    : kind === "caption" ? <CueCard cueId={id} layout="narrow" />
      : kind === "effect" ? <EffectCard {...props} />
        : kind === "graphic" ? <GraphicCard {...props} />
          : kind === "cut" ? <CutCard {...props} />
            : kind === "sfx" ? <SfxCard {...props} />
              : kind === "music" ? <MusicCard layout="narrow" />
                : kind === "logo" ? <LogoCard layout="narrow" />
                  : kind === "segment" ? <SegmentCard {...props} /> : null;
  return (
    <Dialog open onClose={onClose} variant="sheet" scene="ITEM ACTIONS" title={head} hideTitle width={560}>
      {card || <p style={{ margin: 0, color: "var(--color-dark-dim)" }}>Nothing to change here.</p>}
    </Dialog>
  );
}

function Skeleton({ label = "PULLING THE EDIT PLAN…" }) {
  return (
    <div className="kf-ed">
      <style href="kf-ai-editor-styles" precedence="kf">{CSS}</style>
      <div className="kf-ed-wrap" aria-busy="true">
        <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>SC 03 · THE EDIT BAY</span>
        <p role="status" className="rec-blip" style={{ marginTop: 18 }}>{label}</p>
        <div className="kf-ed-grid">
          {[300, 460, 360].map((h, i) => (
            <div key={i} aria-hidden="true" className="editor-card" style={{ height: h, position: "relative" }}><div className="film-scan" style={{ opacity: 0.3 }} /></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Blocked({ notice, onAction }) {
  return (
    <div className="kf-ed">
      <style href="kf-ai-editor-styles" precedence="kf">{CSS}</style>
      <div className="kf-ed-wrap" style={{ maxWidth: 760 }}>
        <span className="scene-pill" style={{ "--tagc": "#d8271b" }}>SC 03 · THE EDIT BAY</span>
        <div style={{ marginTop: 24 }}><EditNotice notice={notice} onAction={onAction} focusOnMount /></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the bay
function EditBay({ edit, onList, onNew }) {
  const f = useEditorActions();
  const s = useEditor();
  const reduce = useReducedMotion();
  const wide = useSyncExternalStore(WIDE.subscribe, WIDE.get, () => true);
  const medium = useSyncExternalStore(MEDIUM.subscribe, MEDIUM.get, () => true);
  const layout = wide ? "wide" : medium ? "medium" : "narrow";
  const online = useSyncExternalStore(subscribeOnline, getOnline, () => true);
  const stageRef = useRef(null);
  const transcriptHeadId = useId();
  const [compare, setCompare] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [dismissed, setDismissed] = useState([]);
  const [lastInspector, setLastInspector] = useState("captions");

  const previewRenderId = s.previewRenderId;
  const previewUrl = useSyncExternalStore(f.media.subscribe, () => (previewRenderId ? f.media.get("preview", previewRenderId) : null));
  const sourceUrl = useSyncExternalStore(f.media.subscribe, () => f.media.get("source-proxy"));

  const panel = s.panel;
  if (panel !== "transcript" && panel !== lastInspector) setLastInspector(panel);
  const activeTab = layout === "wide" && panel === "transcript" ? lastInspector : panel;

  const focusCard = (ref) => {
    const p = PANEL_FOR_KIND[ref.kind];
    if (p && !(layout === "wide" && p === "transcript")) f.setPanel(p);
    let tries = 8;
    const attempt = () => {
      const el = document.getElementById(`kf-item-${ref.kind}-${ref.id}`);
      if (el) { el.focus({ preventScroll: false }); return; }
      if (tries-- > 0) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  };

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement && document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // Bring the selected item's card into view when the selection came from elsewhere.
  const sel = s.selection;
  const selSeq = sel?.seq ?? null;
  const selKind = sel?.kind ?? null;
  const selId = sel?.id ?? null;
  const selSource = sel?.source ?? null;
  useEffect(() => {
    if (selSeq == null || selSource === "card") return;
    if (layout === "narrow" && (selSource === "timeline" || selSource === "transcript")) return;
    document.getElementById(`kf-item-${selKind}-${selId}`)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [selSeq, selKind, selId, selSource, layout, reduce]);

  // Keyboard shortcuts (UX.md §4.9).
  const onKeyDown = useEffectEvent((e) => {
    const dialogOpen = !!s.ui.dialog || !!document.querySelector("dialog[open]");
    const m = matchShortcut(e, { dialogOpen, paused: !playerClock.getSnapshot().playing });
    if (!m) return;
    const current = s.selection;
    switch (m.action) {
      case "togglePlay": e.preventDefault(); playerClock.toggle(); break;
      case "jumpBack": case "jumpForward": case "nudgeBack": case "nudgeForward":
        e.preventDefault(); f.seek(f.planNow() + m.amount); break;
      case "frameBack": case "frameForward": e.preventDefault(); playerClock.stepFrames(m.amount); break;
      case "prevItem": case "nextItem": {
        e.preventDefault();
        const n = neighborItem(s.plan, current, m.action === "nextItem" ? 1 : -1, f.planNow());
        if (n) f.selectItem({ kind: n.kind, id: n.id }, { source: "keyboard" });
        break;
      }
      case "itemActions":
        if (!current || current.kind === "word") return;
        e.preventDefault();
        if (layout === "narrow") f.openDialog("item", { kind: current.kind, id: current.id });
        else focusCard(current);
        break;
      case "removeSelected":
        if (!current) return;
        e.preventDefault();
        f.removeItem(current.kind, current.id);
        break;
      case "undo": e.preventDefault(); f.undo(); break;
      case "redo": e.preventDefault(); f.redo(); break;
      case "escape": if (!dialogOpen && current) f.clearSelection(); break;
      case "showShortcuts": e.preventDefault(); f.openDialog("shortcuts"); break;
      default: break;
    }
  });
  useEffect(() => {
    const handler = (e) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---- blocking states
  if (s.loadState === "notFound") return <Blocked notice={noticeCopy("NOT_FOUND")} onAction={() => onList?.()} />;
  if (!s.plan && s.loadState === "error") {
    const copy = errorCopy(s.error);
    return <Blocked notice={{ title: copy.title === "SOMETHING JAMMED" ? "THE EDIT BAY WON'T OPEN" : copy.title, body: copy.body, tone: "error", actions: [{ id: "reload", label: "Try again", primary: true }, { id: "list", label: "← My edits" }] }} onAction={(a) => (a === "reload" ? f.reload() : onList?.())} />;
  }
  if (!s.plan || !s.transcript) return <Skeleton />;
  if (!Array.isArray(s.transcript.words) || !s.transcript.words.length) {
    return <Blocked notice={{ ...noticeCopy("NO_SPEECH"), actions: [{ id: "uploadAnother", label: "Upload another take", primary: true }, { id: "list", label: "← My edits" }] }} onAction={(a) => (a === "uploadAnother" ? onNew?.() : onList?.())} />;
  }

  // ---- derived
  const plan = s.plan;
  const view = s.view || edit;
  const title = plan.title || view?.title || edit?.title || "Untitled edit";
  const pendingCount = selectPendingChanges(s);
  const estimate = selectPreviewEstimate(s);
  const r = s.render;
  const rendering = !!r && r.kind !== "export" && (r.status === "queued" || r.status === "running");
  const renderingCurrent = rendering && (r.planRevision ?? 0) >= s.revision;
  const sending = s.entries.some((e) => e.state !== "confirmed");
  const ex = s.exportRender;
  const exporting = !!ex && (ex.status === "queued" || ex.status === "running");
  const offline = !online || s.queue.state === "offline";
  const statusLine = previewStatusLine({ previewRevision: s.previewRevision, pendingChanges: pendingCount, render: r });
  const statusColor = rendering ? "var(--color-mag)" : pendingCount ? "var(--color-am)" : "var(--color-lm)";
  const queueLabel = { sending: "● SAVING", retrying: "● RETRYING", offline: "● OFFLINE · CHANGES HELD", auth: "● SIGNED OUT" }[s.queue.state];
  const estText = estimate.sec < 60 ? `~${Math.max(5, estimate.sec)}s` : `~${Math.round(estimate.sec / 60)} min`;
  const hasMedia = compare ? !!sourceUrl : !!previewUrl;

  const notices = [];
  if (offline) notices.push({ ...noticeCopy("OFFLINE"), key: "OFFLINE", actions: s.queue.state === "offline" ? [{ id: "retrySend", label: "Try sending now", primary: true }] : [] });
  if (r && r.kind !== "export" && r.status === "failed") notices.push({ ...noticeCopy("RENDER_FAILED", { rev: r.planRevision, shown: s.previewRevision ?? "—" }), key: `RENDER_FAILED_${r.renderId}` });
  if (ex && ex.status === "failed" && s.ui.dialog?.type !== "export") notices.push({ ...noticeCopy("EXPORT_FAILED", { message: ex.error?.message || "The export didn't finish. Your edit is safe." }), key: `EXPORT_FAILED_${ex.renderId}` });
  for (const n of editorNotices(view, s.transcript)) {
    notices.push({ ...n, actions: [...(n.actions || []).filter((a) => a.id !== "dismiss"), { id: "dismiss", label: "Dismiss" }] });
  }
  const visibleNotices = notices.filter((n) => !dismissed.includes(n.key));

  const onNotice = (key, actionId) => {
    switch (actionId) {
      case "retryRender": f.requestPreview(); break;
      case "undo": f.undo(); break;
      case "retrySend": f.retrySending(); break;
      case "retryExport": f.openDialog("export"); break;
      case "searchStock": f.setPanel("broll"); break;
      case "redirect":
        f.api.retryEdit(f.editId, { stage: "BUILDING_EDIT_PLAN", mode: "force" }).then(
          () => f.toast({ message: "Re-directing with AI — the editor re-opens when the new cut is ready." }),
          (err) => f.toast({ tone: "error", message: errorCopy(err).body }),
        );
        break;
      case "dismiss": setDismissed((d) => [...d, key]); break;
      default: break;
    }
  };

  const onChip = (chip) => {
    if (chip.warn) { f.openDialog("qa"); return; }
    if (chip.key === "fillers") setFilter("FILLER");
    else if (chip.key === "silence") setFilter("SILENCE");
    f.setPanel(chip.panel);
    if (layout === "narrow") requestAnimationFrame(() => document.getElementById(`kf-tab-${chip.panel}`)?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" }));
  };
  const onTimelineActivate = (ref, wasSelected) => {
    if (layout === "narrow") f.openDialog("item", ref);
    else if (wasSelected) focusCard(ref);
  };
  const updatePreview = async () => {
    const res = await f.requestPreview();
    if (!res.ok) f.toast({ tone: "error", title: "PREVIEW JAMMED", message: errorCopy(res.error).body });
  };

  const dlg = s.ui.dialog;
  const close = () => f.closeDialog();

  return (
    <div className="kf-ed" data-layout={layout}>
      <style href="kf-ai-editor-styles" precedence="kf">{CSS}</style>
      <div className="kf-ed-wrap">
        <h1 className="sr-only">AI edit — {title}</h1>
        <header className="kf-ed-head">
          <div className="kf-ed-headmain">
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>SC 03 · THE EDIT BAY</span>
              <span className="editor-status" style={{ color: statusColor }}>{statusLine}</span>
              {queueLabel && <span className="editor-status" style={{ color: s.queue.state === "sending" ? "var(--color-dark-dim)" : "var(--color-am)" }}>{queueLabel}</span>}
            </div>
            <TitleField value={title} onSave={(t) => f.apply({ type: "edit.setTitle", title: t })} />
            <p className="label-mono" style={{ margin: "6px 0 0", color: "var(--color-dark-dim)" }}>
              {lengthLine(view?.source?.durationSec ?? plan.source?.durationSec, outDuration(plan))} · {plan.output?.aspect} · r{s.revision}
            </p>
          </div>
          <div className="kf-ed-tools">
            <div role="group" aria-label="History" style={{ display: "flex", gap: 6 }}>
              <button type="button" className="btn-outline-dark btn-sm" onClick={() => f.undo()} disabled={!s.history.canUndo} aria-keyshortcuts={ariaKeyshortcuts("undo")} aria-label={s.history.undoLabel ? `Undo: ${s.history.undoLabel}` : "Undo"} title={s.history.undoLabel ? `Undo: ${s.history.undoLabel}` : "Undo"} style={{ minHeight: 44, padding: "0 16px" }}>
                <span aria-hidden="true">↶</span>&nbsp;Undo
              </button>
              <button type="button" className="btn-outline-dark btn-sm" onClick={() => f.redo()} disabled={!s.history.canRedo} aria-keyshortcuts={ariaKeyshortcuts("redo")} aria-label={s.history.redoLabel ? `Redo: ${s.history.redoLabel}` : "Redo"} title={s.history.redoLabel ? `Redo: ${s.history.redoLabel}` : "Redo"} style={{ minHeight: 44, padding: "0 16px" }}>
                Redo&nbsp;<span aria-hidden="true">↷</span>
              </button>
            </div>
            <Switch label="Auto-update preview" checked={s.ui.autoUpdate} onChange={(v) => f.setAutoUpdate(v)} />
            <button type="button" className="btn-outline-dark btn-sm" aria-haspopup="dialog" aria-keyshortcuts="?" onClick={() => f.openDialog("shortcuts")} style={{ minHeight: 44, padding: "0 16px" }}>Shortcuts (?)</button>
            <button type="button" className="link-mono on-dark" onClick={() => onList?.()} style={{ minHeight: 44 }}>← My edits</button>
          </div>
        </header>

        {visibleNotices.length > 0 && (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {visibleNotices.map((n) => <EditNotice key={n.key} notice={n} compact onAction={(a) => onNotice(n.key, a)} />)}
          </div>
        )}

        <div className="kf-ed-grid">
          {layout === "wide" && (
            <aside className="kf-ed-col kf-ed-side editor-card" aria-labelledby={transcriptHeadId}>
              <div className="editor-head">
                <span className="tl-dot" style={{ background: "#ff5f57" }} />
                <span className="tl-dot" style={{ background: "#febc2e" }} />
                <span className="tl-dot" style={{ background: "#28c840" }} />
                <h2 id={transcriptHeadId} style={{ margin: "0 0 0 10px", fontFamily: "var(--font-mono)", fontWeight: 400, fontSize: 10, letterSpacing: "0.2em", color: "var(--color-dark-dim)" }}>TRANSCRIPT & CUTS</h2>
              </div>
              <div id="kf-panel-transcript" className="kf-ed-scroll" role="region" aria-labelledby={transcriptHeadId} tabIndex={0}>
                <TranscriptPanel layout="wide" filter={filter} onFilter={setFilter} />
              </div>
            </aside>
          )}

          <div className="kf-ed-col kf-ed-center">
            <div className="kf-ed-stage">
              <VideoPreview compare={compare} stageRef={stageRef} fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen} />
            </div>
            <div className="editor-card" style={{ padding: 16 }}>
              <SummaryChips onChip={onChip} />
            </div>
            <div className="editor-card" style={{ padding: 16, overflow: "visible" }}>
              <Timeline onActivate={onTimelineActivate} />
            </div>
          </div>

          <aside className="kf-ed-col kf-ed-side editor-card" aria-label="Inspector">
            <InspectorTabs
              layout={layout}
              tabs={layout === "wide" ? WIDE_TABS : ALL_TABS}
              active={activeTab}
              onPanel={(p) => f.setPanel(p)}
              transcriptFilter={filter}
              onTranscriptFilter={setFilter}
            />
          </aside>
        </div>
      </div>

      <div className="kf-ed-bar" role="region" aria-label="Playback and export">
        <div className="kf-ed-bar-in">
          <PlayerControls
            hasMedia={hasMedia}
            compare={compare}
            canCompare={!!sourceUrl}
            onToggleCompare={() => setCompare((c) => !c)}
            fullscreen={fullscreen}
            onToggleFullscreen={toggleFullscreen}
          />
          <div className="kf-ed-bar-actions">
            <button
              type="button"
              className="btn-ink on-dark"
              onClick={updatePreview}
              disabled={!pendingCount || renderingCurrent || sending}
              aria-describedby={pendingCount && !renderingCurrent ? undefined : undefined}
              style={{ minHeight: 44, whiteSpace: "nowrap" }}
            >
              {renderingCurrent ? `Updating ${Math.round(Number(r.pct) || 0)}%` : pendingCount ? `Update preview (${estText})` : "Preview up to date ✓"}
            </button>
            <button
              type="button"
              className="btn-mag"
              aria-haspopup="dialog"
              onClick={() => f.openDialog("export")}
              disabled={offline}
              title={offline ? "You're offline" : undefined}
              style={{ minHeight: 44, whiteSpace: "nowrap" }}
            >
              {exporting ? `Exporting ${Math.round(Number(ex.pct) || 0)}%` : "Export"}
            </button>
          </div>
        </div>
      </div>

      <Toasts toasts={s.ui.toasts} onDismiss={f.dismissToast} bottomOffset={layout === "narrow" ? 164 : 96} />

      {dlg?.type === "export" && <ExportDialog onClose={close} />}
      {dlg?.type === "shortcuts" && <ShortcutsDialog onClose={close} />}
      {dlg?.type === "brollReplace" && <BrollReplaceDialog id={dlg.props?.id} tab={dlg.props?.tab} onClose={close} />}
      {dlg?.type === "reframe" && <ReframeDialog segmentId={dlg.props?.segmentId} onClose={close} />}
      {dlg?.type === "confirm" && <ConfirmDialog {...dlg.props} onClose={close} />}
      {dlg?.type === "qa" && <QaDialog onClose={close} />}
      {dlg?.type === "item" && <ItemSheet kind={dlg.props?.kind} id={dlg.props?.id} onClose={close} />}
    </div>
  );
}

// Props per UX.md §4.6 (rendered by AiEditSession, which owns the edit's live connection and passes
// every new ProjectView in as `edit`).
export default function AiEditor({ edit, onNeedAuth, onList, onNew }) {
  return (
    <EditorProvider editId={edit?.id} view={edit} liveView onNeedAuth={onNeedAuth}>
      <EditBay edit={edit} onList={onList} onNew={onNew} />
    </EditorProvider>
  );
}
