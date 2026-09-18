import { useId, useRef, useState } from "react";
import { RichText } from "./EditNotice.jsx";
import { UPLOAD_COPY, fmtBytes, fmtDuration } from "../editFormat.js";

const ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v";

// The drop target, drawn as a camera viewfinder. It is a real <button> (Tab + Enter/Space opens the
// picker) described by the limits line; the file input behind it is hidden from the tab order and
// from assistive tech. Drag-and-drop works on the same button. On touch devices a "Record now"
// control opens the front camera. Once a file is chosen it shows poster, name, size, duration and
// resolution with a Remove button. Blocking issues are announced in a role="alert" region,
// everything else in a polite status region — both stay mounted so changes are always heard.
export default function UploadDropzone({
  onFile,
  onRemove,
  file = null,
  meta = null,
  issues = [],
  statusText = "",
  limitsText = UPLOAD_COPY.limits(),
  accept = ACCEPT,
  disabled = false,
  label = UPLOAD_COPY.dropzone,
}) {
  const uid = useId();
  const limitsId = `kf-drop-limits-${uid}`;
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const pick = (list) => {
    const f = list && list[0];
    if (f && !disabled) onFile?.(f);
  };
  const blocking = issues.filter((i) => i.blocking);
  const notes = issues.filter((i) => !i.blocking);
  const corner = (pos) => {
    const c = dragging ? "var(--color-mag)" : "rgba(242,237,226,.55)";
    const s = { position: "absolute", width: 22, height: 22, borderColor: c, borderStyle: "solid", borderWidth: 0, transition: "border-color .2s ease" };
    if (pos.includes("t")) { s.top = 12; s.borderTopWidth = 2; } else { s.bottom = 12; s.borderBottomWidth = 2; }
    if (pos.includes("l")) { s.left = 12; s.borderLeftWidth = 2; } else { s.right = 12; s.borderRightWidth = 2; }
    return <span aria-hidden="true" style={s} />;
  };

  return (
    <div style={{ minWidth: 0 }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="video/*"
        capture="user"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
      />

      {!file ? (
        <button
          type="button"
          aria-describedby={limitsId}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => { e.preventDefault(); depth.current += 1; setDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; }}
          onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDragging(false); }}
          onDrop={(e) => { e.preventDefault(); depth.current = 0; setDragging(false); pick(e.dataTransfer?.files); }}
          style={{
            position: "relative", width: "100%", minHeight: 232, padding: "36px 20px", borderRadius: 14,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center",
            background: dragging ? "rgba(232,50,168,.08)" : "var(--color-dark)",
            border: `1px dashed ${dragging ? "var(--color-mag)" : "rgba(242,237,226,.26)"}`,
            cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, color: "var(--color-dark-ink)",
            transition: "background .25s ease, border-color .25s ease",
          }}
        >
          {corner("tl")}{corner("tr")}{corner("bl")}{corner("br")}
          <span aria-hidden="true" style={{ position: "absolute", top: 18, left: 44, display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: dragging ? "var(--color-mag)" : "var(--color-dark-dim)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-rec)", animation: dragging ? "kf2-blink 1s steps(1) infinite" : "none", opacity: dragging ? 1 : 0.6 }} />
            {dragging ? "REC · DROP TO LOAD" : "STANDBY"}
          </span>
          <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid rgba(242,237,226,.3)", background: "rgba(242,237,226,.06)" }}>
            <span style={{ width: 0, height: 0, marginLeft: 4, borderLeft: "15px solid var(--color-dark-ink)", borderTop: "9px solid transparent", borderBottom: "9px solid transparent" }} />
          </span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(17px,2.2vw,20px)", lineHeight: 1.25, maxWidth: 320 }}>
            {dragging ? "Let go to load the take" : label}
          </span>
          <span id={limitsId} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", lineHeight: 1.7, color: "var(--color-dark-dim)" }}>
            {limitsText}
          </span>
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 14, background: "var(--color-dark)", border: "1px solid rgba(242,237,226,.12)", minWidth: 0 }}>
          <div style={{ position: "relative", width: 72, flexShrink: 0, aspectRatio: meta?.width && meta?.height ? `${meta.width} / ${meta.height}` : "9 / 16", maxHeight: 112, borderRadius: 8, overflow: "hidden", background: "var(--color-dark-2)" }}>
            {meta?.posterUrl ? (
              <img src={meta.posterUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div className="film-drift" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #e832a8, #6b1050 55%, #2a0a20)", opacity: 0.85 }} />
            )}
            <div className="film-scan" style={{ opacity: 0.3 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div title={file.name} style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--color-dark-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {file.name}
            </div>
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: "4px 12px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-dark-dim)", fontVariantNumeric: "tabular-nums" }}>
              <span>{fmtBytes(file.size)}</span>
              {meta?.durationSec != null && <span>{fmtDuration(meta.durationSec)}</span>}
              {meta?.width > 0 && <span>{meta.width}×{meta.height}</span>}
              {meta?.aspect && <span>{meta.aspect}</span>}
            </div>
            <span id={limitsId} className="sr-only">{limitsText}</span>
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              aria-label={`Remove ${file.name}`}
              className="btn-outline-dark btn-sm"
              style={{ minHeight: 44, padding: "8px 14px", fontSize: 13, flexShrink: 0 }}
            >
              Remove
            </button>
          )}
        </div>
      )}

      {!file && (
        <span className="hidden pointer-coarse:inline-flex" style={{ marginTop: 12 }}>
          <button type="button" className="btn-outline-dark btn-sm" disabled={disabled} onClick={() => cameraRef.current?.click()} style={{ minHeight: 44 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-rec)", marginRight: 8 }} />
            Record now
          </button>
        </span>
      )}

      <div role="alert" style={{ marginTop: blocking.length ? 12 : 0 }}>
        {blocking.map((i) => (
          <p key={i.code} style={{ margin: "6px 0 0", display: "flex", gap: 8, fontSize: 14, lineHeight: 1.55, color: "var(--color-dark-ink)" }}>
            <span aria-hidden="true" style={{ color: "#ff6a3c", flexShrink: 0 }}>✕</span>
            <span><RichText text={i.message} /></span>
          </p>
        ))}
      </div>
      <div role="status" aria-live="polite" style={{ marginTop: notes.length ? 10 : 0 }}>
        {notes.map((i) => (
          <p key={i.code} style={{ margin: "6px 0 0", display: "flex", gap: 8, fontSize: 13, lineHeight: 1.55, color: "var(--color-dark-dim)" }}>
            <span aria-hidden="true" style={{ color: "var(--color-am)", flexShrink: 0 }}>⚠</span>
            <span><RichText text={i.message} /></span>
          </p>
        ))}
        {statusText && <span className="sr-only">{statusText}</span>}
      </div>
    </div>
  );
}
