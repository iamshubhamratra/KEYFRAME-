import { useRef, useState } from "react";
import Dialog from "../../components/Dialog.jsx";
import ProgressBar from "../../components/ProgressBar.jsx";
import Switch from "../../components/Switch.jsx";
import RadioChips from "../../components/RadioChips.jsx";
import EditNotice from "../../components/EditNotice.jsx";
import { QDRow, Pill } from "../AdminShared.jsx";
import { useEditor, useEditorActions, selectPendingChanges } from "../../editState.js";
import { outDuration } from "../../editModel.js";
import { EXPORT_QUALITY_OPTIONS, exportStatusLine, fmtDuration, fmtBytes, fmtEtaShort, noticeCopy, errorCopy } from "../../editFormat.js";
import { isFixtureMode } from "../../editApi.js";

// SC 04 · THE DELIVERY (UX.md §1d) — quality, sidecar captions, the estimate and exactly which
// revision goes out. A stale preview is called out first ("2 changes aren't in your preview yet",
// with Update preview first focused). Editing stays open while it exports. When it's done: the MP4,
// .srt, .vtt and credits (fetched through short-lived playback tokens when media is cross-origin),
// the QA rows — "✓ Matches preview r16" when the composition hashes agree — and what it used.

const dimsFor = (plan, profile) => {
  const w = plan?.output?.width || 1080;
  const h = plan?.output?.height || 1920;
  if (profile !== "export720") return [w, h];
  const k = 720 / Math.min(w, h);
  return [Math.round((w * k) / 2) * 2, Math.round((h * k) / 2) * 2];
};

export default function ExportDialog({ onClose }) {
  const f = useEditorActions();
  const s = useEditor();
  const [profile, setProfile] = useState(() => (s.view?.settings?.exportProfile === "export720" ? "export720" : "export1080"));
  const [sidecars, setSidecars] = useState(true);
  const [starting, setStarting] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState(null);
  const [dl, setDl] = useState({ busy: null, error: null });
  const updateRef = useRef(null);

  const plan = s.plan;
  const dur = outDuration(plan);
  const pending = selectPendingChanges(s);
  const ex = s.exportRender;
  const exporting = !!ex && (ex.status === "queued" || ex.status === "running");
  const done = !!ex && ex.status === "done";
  const failed = !!ex && ex.status === "failed";
  const phase = starting ? "starting" : exporting ? "exporting" : done && !fresh ? "done" : failed && !fresh ? "failed" : "setup";
  const offline = s.queue.state === "offline" || (typeof navigator !== "undefined" && navigator.onLine === false);
  const [w, h] = dimsFor(plan, profile);

  const start = async () => {
    setStarting(true);
    setError(null);
    setFresh(false);
    const r = await f.requestExport({ profile });
    setStarting(false);
    if (!r.ok) {
      if (r.error?.status === 401) f.needAuth(() => start());
      setError(errorCopy(r.error));
    }
  };
  const updateFirst = () => {
    f.requestPreview();
    f.toast({ message: "Updating the preview — export when it's ready." });
    onClose?.();
  };
  const cancelExport = async () => {
    try { await f.api.cancelEdit(f.editId, { target: "render", renderId: ex?.renderId }); f.toast({ message: "Export stopped." }); }
    catch (err) { setError(errorCopy(err)); }
  };

  // ---- done-state data
  const item = s.exports?.items?.find((i) => i.renderId === ex?.renderId) || null;
  const files = item?.files || ex?.files || null;
  const checks = (item?.checks?.length ? item.checks : ex?.qa?.checks) || [];
  const usage = item?.usage || ex?.usage || null;
  const credits = (item?.credits?.length ? item.credits : ex?.credits) || [];
  const previewOfRev = (s.view?.renders || []).find((r) => r.kind === "preview" && r.status === "done" && r.planRevision === ex?.planRevision);
  const hashMatch = !!previewOfRev && !!ex?.compositionHash && previewOfRev.compositionHash === ex.compositionHash;
  const rows = checks.length ? checks : ex ? [{ id: "preview_match", ok: hashMatch, label: hashMatch ? `Matches preview r${ex.planRevision}` : `Preview r${ex.planRevision} wasn't compared`, detail: hashMatch ? "same composition" : "update the preview to compare" }] : [];
  const staleExport = done && (ex.planRevision ?? 0) < s.revision;

  const download = async (key) => {
    const file = files?.[key];
    if (!file) return;
    setDl({ busy: key, error: null });
    try {
      const [url] = await f.media.fetchNow([{ kind: file.kind, key: file.key, download: true }]);
      if (!url) {
        setDl({ busy: null, error: isFixtureMode() ? "Fixture mode has no file behind this download." : "That file isn't ready yet — try again in a moment." });
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename || "";
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setDl({ busy: null, error: null });
    } catch (err) {
      if (err?.status === 401) f.needAuth(() => download(key));
      setDl({ busy: null, error: errorCopy(err).body });
    }
  };

  const title = phase === "done" ? <>That's a <span style={{ color: "var(--color-lm)" }}>wrap.</span></> : phase === "exporting" || phase === "starting" ? "Rolling the export…" : phase === "failed" ? "The export got cut." : "Export your edit";
  const stale = phase === "setup" && pending > 0;

  let actions = null;
  if (phase === "setup") {
    actions = stale ? (
      <>
        <button type="button" ref={updateRef} className="btn-ink on-dark" onClick={updateFirst} style={{ minHeight: 44 }}>Update preview first</button>
        <button type="button" className="btn-mag" onClick={start} disabled={offline} style={{ minHeight: 44 }}>Export anyway</button>
      </>
    ) : (
      <>
        <button type="button" className="btn-outline-dark btn-sm" onClick={onClose} style={{ minHeight: 44 }}>Not yet</button>
        <button type="button" className="btn-mag" onClick={start} disabled={offline} style={{ minHeight: 44 }}>Export {profile === "export720" ? "720p" : "1080p"} →</button>
      </>
    );
  } else if (phase === "exporting" || phase === "starting") {
    actions = (
      <>
        <button type="button" className="btn-outline-dark btn-sm" onClick={cancelExport} disabled={phase === "starting"} style={{ minHeight: 44 }}>Stop export</button>
        <button type="button" className="btn-ink on-dark" onClick={onClose} style={{ minHeight: 44 }}>Keep editing</button>
      </>
    );
  } else if (phase === "done") {
    actions = (
      <>
        {staleExport && <button type="button" className="btn-outline-dark btn-sm" onClick={() => setFresh(true)} style={{ minHeight: 44 }}>Export r{s.revision}</button>}
        <button type="button" className="btn-ink on-dark" onClick={onClose} style={{ minHeight: 44 }}>Close</button>
      </>
    );
  }

  return (
    <Dialog open onClose={onClose} scene="SC 04 · THE DELIVERY" title={title} width={640} initialFocusRef={stale ? updateRef : undefined} actions={actions}>
      {phase === "setup" && (
        <div style={{ display: "grid", gap: 16 }}>
          {stale && (
            <div role="status" style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,176,58,.45)", background: "rgba(255,176,58,.08)", fontSize: 15, color: "var(--color-dark-ink)" }}>
              <span aria-hidden="true" style={{ color: "var(--color-am)" }}>⚠ </span>
              {pending} {pending === 1 ? "change isn't" : "changes aren't"} in your preview yet.
              <span style={{ display: "block", marginTop: 4, fontSize: 13, color: "var(--color-dark-dim)" }}>The export always matches your edit — updating the preview first lets you check it.</span>
            </div>
          )}
          <RadioChips label="Quality" variant="tile" columns={2} value={profile} options={EXPORT_QUALITY_OPTIONS} onChange={setProfile} />
          <Switch label="Include .SRT and .VTT" description="Caption files for YouTube, LinkedIn and players" checked={sidecars} onChange={setSidecars} />
          <p className="label-mono" style={{ margin: 0, color: "var(--color-dark-ink)", lineHeight: 1.8 }}>
            EXPORTS REVISION r{s.revision} · {fmtDuration(dur)} · {w}×{h}<br />
            <span style={{ color: "var(--color-dark-dim)" }}>ESTIMATE {fmtEtaShort(Math.max(20, dur * (profile === "export720" ? 0.6 : 1.1)))} · NO AI CALLS · 1 RENDER</span>
          </p>
          {offline && <p role="alert" style={{ margin: 0, fontSize: 14, color: "var(--color-am)" }}>You're offline — export when you're back online.</p>}
          {error && <EditNotice compact tone="error" title={error.title} body={error.body} />}
        </div>
      )}

      {(phase === "exporting" || phase === "starting") && (
        <div style={{ display: "grid", gap: 14 }}>
          <p className="editor-status" style={{ margin: 0, color: "var(--color-mag)" }}>{ex && phase === "exporting" ? exportStatusLine(ex) : "STARTING THE EXPORT…"}</p>
          <ProgressBar label="Export" value={Number(ex?.pct) || 0} indeterminate={phase === "starting" || ex?.status === "queued"} valueText={ex ? exportStatusLine(ex) : "Starting the export"} showValue />
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--color-dark-ink)" }}>Edits you make now go into your next export.</p>
          {error && <EditNotice compact tone="error" title={error.title} body={error.body} />}
        </div>
      )}

      {phase === "failed" && (
        <EditNotice
          notice={noticeCopy("EXPORT_FAILED", { message: ex?.error?.message || ex?.message || "The render stopped before the file was finished. Your edit is safe." })}
          onAction={() => start()}
          compact
        />
      )}

      {phase === "done" && (
        <div style={{ display: "grid", gap: 18 }}>
          <p className="editor-status" style={{ margin: 0 }}>{exportStatusLine(ex, { srt: sidecars && !!files?.srt, vtt: sidecars && !!files?.vtt })} · r{ex.planRevision}</p>
          {staleExport && <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--color-am)" }}>Your edit changed after this export (now r{s.revision}).</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button type="button" className="btn-mag" onClick={() => download("mp4")} disabled={!files?.mp4 || dl.busy === "mp4"} aria-busy={dl.busy === "mp4" || undefined} style={{ minHeight: 44 }}>
              Download MP4 <span aria-hidden="true">↓</span>{files?.mp4?.sizeBytes ? <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 4 }}>{fmtBytes(files.mp4.sizeBytes)}</span> : null}
            </button>
            {sidecars && files?.srt && <button type="button" className="btn-outline-dark btn-sm" onClick={() => download("srt")} style={{ minHeight: 44 }}>Captions .srt</button>}
            {sidecars && files?.vtt && <button type="button" className="btn-outline-dark btn-sm" onClick={() => download("vtt")} style={{ minHeight: 44 }}>.vtt</button>}
            {files?.credits && <button type="button" className="btn-outline-dark btn-sm" onClick={() => download("credits")} style={{ minHeight: 44 }}>Credits</button>}
          </div>
          {dl.error && <p role="alert" style={{ margin: 0, fontSize: 14, color: "#ff6a3c" }}>{dl.error}</p>}

          <section aria-label="Quality check">
            <h3 className="label-mono" style={{ margin: "0 0 8px", color: "var(--color-dark-dim)", fontWeight: 500 }}>QUALITY CHECK{ex.qa?.score != null ? ` · ${ex.qa.score}/10` : ""}</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {rows.map((c) => <QDRow key={c.id || c.label} ok={!!c.ok} label={c.label} detail={c.detail} />)}
            </ul>
          </section>

          {usage && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Pill label="AI CALLS" value={usage.aiCalls ?? 0} c="#e832a8" />
              <Pill label="STOCK SEARCHES" value={usage.stockSearches ?? 0} c="#23c8e0" />
              <Pill label="RENDERS" value={usage.renders ?? 0} c="#ffb03a" />
            </div>
          )}

          {credits.length > 0 && (
            <section aria-label="Credits">
              <h3 className="label-mono" style={{ margin: "0 0 6px", color: "var(--color-dark-dim)", fontWeight: 500 }}>CREDITS</h3>
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3, fontSize: 13, color: "var(--color-dark-dim)" }}>
                {credits.map((c) => <li key={c.assetId || c.text}>{c.text}{c.license ? ` · ${c.license}` : ""}</li>)}
              </ul>
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}
