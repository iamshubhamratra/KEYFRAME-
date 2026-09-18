import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Dialog from "../../../components/Dialog.jsx";
import { useEditor, useEditorActions } from "../../../editState.js";
import { findItem, clamp, round3 } from "../../../editModel.js";
import { SEGMENT_LABELS, fmtTcShort } from "../../../editFormat.js";
import { CostHint } from "../ItemCard.jsx";

// REFRAME SHOT (UX.md §1d panel 7) — the source frame with a crop box in the output aspect. Drag it,
// or focus it and use the arrows (±1 %, Shift ±5 %) and +/− to zoom; X/Y/Zoom are also plain number
// fields. "Auto — follow face" hands framing back to the face track. A warning appears when the crop
// would cut into the detected face.

const OUT_RATIO = { "9:16": 9 / 16, "16:9": 16 / 9, "1:1": 1 };

function geometry(srcW, srcH, aspect, zoom) {
  const srcAR = srcW / srcH;
  const outAR = OUT_RATIO[aspect] || OUT_RATIO["9:16"];
  const bw = outAR <= srcAR ? outAR / srcAR : 1;
  const bh = outAR <= srcAR ? 1 : srcAR / outAR;
  return { srcAR, cw: bw / zoom, ch: bh / zoom };
}
const fitCrop = (c, srcW, srcH, aspect) => {
  const zoom = clamp(Math.round(c.zoom * 100) / 100, 1, 2);
  const g = geometry(srcW, srcH, aspect, zoom);
  return { zoom, cx: clamp(c.cx, g.cw / 2, 1 - g.cw / 2), cy: clamp(c.cy, g.ch / 2, 1 - g.ch / 2) };
};

const numInput = { width: "100%", minHeight: 44, boxSizing: "border-box", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 13 };

export default function ReframeDialog({ segmentId, onClose }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const seg = findItem(plan, "segment", segmentId);
  const uid = useId();
  const frameRef = useRef(null);
  const drag = useRef(null);
  const srcW = plan?.source?.width || 1080;
  const srcH = plan?.source?.height || 1920;
  const aspect = plan?.output?.aspect || "9:16";
  const kf = seg?.framing?.keyframes?.[0] || null;
  const [crop, setCrop] = useState(() => {
    const uc = seg?.framing?.userCrop;
    return fitCrop({ cx: uc?.cx ?? kf?.cx ?? 0.5, cy: uc?.cy ?? 0.5, zoom: uc?.zoom ?? seg?.framing?.zoomBase ?? 1 }, srcW, srcH, aspect);
  });
  const poster = useSyncExternalStore(f.media.subscribe, () => f.media.get("poster"));
  useEffect(() => { f.media.request("poster"); }, [f]);

  if (!seg) return null;
  const g = geometry(srcW, srcH, aspect, crop.zoom);
  const set = (patch) => setCrop((c) => fitCrop({ ...c, ...patch }, srcW, srcH, aspect));

  // Face (from the stored face track) as a box in normalized frame units.
  const face = kf ? { x: kf.cx ?? 0.5, y: kf.cy ?? 0.38 } : null;
  const fw = 0.22;
  const fh = fw * (srcW / srcH);
  const faceOut = !!face && (face.x - fw / 2 < crop.cx - g.cw / 2 || face.x + fw / 2 > crop.cx + g.cw / 2 || face.y - fh / 2 < crop.cy - g.ch / 2 || face.y + fh / 2 > crop.cy + g.ch / 2);

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    switch (e.key) {
      case "ArrowLeft": set({ cx: crop.cx - step }); break;
      case "ArrowRight": set({ cx: crop.cx + step }); break;
      case "ArrowUp": set({ cy: crop.cy - step }); break;
      case "ArrowDown": set({ cy: crop.cy + step }); break;
      case "+": case "=": set({ zoom: crop.zoom + 0.05 }); break;
      case "-": case "_": set({ zoom: crop.zoom - 0.05 }); break;
      default: return;
    }
    e.preventDefault();
  };
  const onPointerDown = (e) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: crop.cx, cy: crop.cy, w: rect.width, h: rect.height };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    set({ cx: d.cx + (e.clientX - d.x) / d.w, cy: d.cy + (e.clientY - d.y) / d.h });
  };
  const endDrag = () => { drag.current = null; };

  const apply = () => {
    const r = f.apply({ type: "framing.adjust", segmentId, offsetX: round3((crop.cx - 0.5) * 2), offsetY: round3((crop.cy - 0.5) * 2), zoom: crop.zoom });
    if (!r.ok) { f.toast({ tone: "error", message: r.reason }); return; }
    f.toast({ message: `Shot re-framed · rendering ${fmtTcShort(seg.resolved?.outIn)}–${fmtTcShort(seg.resolved?.outOut)}` });
    onClose?.();
  };
  const auto = () => {
    if (seg.framing?.userCrop) f.apply({ type: "framing.reset", segmentId });
    f.toast({ message: "Framing follows your face again" });
    onClose?.();
  };

  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  return (
    <Dialog
      open
      onClose={onClose}
      scene="FORMAT"
      title={`Reframe ${SEGMENT_LABELS[seg.type] || "shot"}${seg.label ? ` — ${seg.label}` : ""}`}
      description={`Crop for ${aspect}. Drag the box, or focus it and use the arrow keys; + and − zoom.`}
      width={760}
      actions={
        <>
          <span style={{ marginRight: "auto" }}><CostHint op={{ type: "framing.adjust" }} /></span>
          <button type="button" className="btn-outline-dark btn-sm" onClick={auto} style={{ minHeight: 44 }}>Auto — follow face</button>
          <button type="button" className="btn-outline-dark btn-sm" onClick={onClose} style={{ minHeight: 44 }}>Cancel</button>
          <button type="button" className="btn-ink on-dark" onClick={apply} style={{ minHeight: 44 }}>Apply crop</button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, alignItems: "start" }}>
        <div
          ref={frameRef}
          style={{ position: "relative", width: `min(100%, calc(46dvh * ${g.srcAR}))`, aspectRatio: `${g.srcAR}`, margin: "0 auto", overflow: "hidden", borderRadius: 12, background: "var(--color-dark-2)", border: "1px solid var(--color-dark-line)", touchAction: "none" }}
        >
          {poster && <img src={poster} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", userSelect: "none" }} />}
          {face && (
            <span aria-hidden="true" style={{ position: "absolute", left: pct(face.x - fw / 2), top: pct(face.y - fh / 2), width: pct(fw), height: pct(fh), border: `1.5px dashed ${faceOut ? "var(--color-am)" : "var(--color-lm)"}`, borderRadius: "50%", zIndex: 3, pointerEvents: "none" }} />
          )}
          <div
            role="group"
            tabIndex={0}
            aria-label="Crop box"
            aria-describedby={`${uid}-val`}
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight + -"
            data-kf-zone="slider"
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              position: "absolute", zIndex: 2, cursor: "grab",
              left: pct(crop.cx - g.cw / 2), top: pct(crop.cy - g.ch / 2), width: pct(g.cw), height: pct(g.ch),
              border: "2px solid var(--color-mag)", borderRadius: 4, boxShadow: "0 0 0 9999px rgba(13,11,7,.62)",
              backgroundImage: "linear-gradient(rgba(242,237,226,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(242,237,226,.22) 1px, transparent 1px)",
              backgroundSize: "33.333% 33.333%", backgroundPosition: "-1px -1px",
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <p id={`${uid}-val`} className="label-mono" style={{ margin: 0, color: "var(--color-dark-ink)" }}>
            X {Math.round(crop.cx * 100)}% · Y {Math.round(crop.cy * 100)}% · {crop.zoom.toFixed(2)}×
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
            {[
              ["x", "X %", Math.round(crop.cx * 100), 0, 100, 1, (v) => set({ cx: v / 100 })],
              ["y", "Y %", Math.round(crop.cy * 100), 0, 100, 1, (v) => set({ cy: v / 100 })],
              ["z", "Zoom", crop.zoom.toFixed(2), 1, 2, 0.05, (v) => set({ zoom: v })],
            ].map(([key, label, value, min, max, step, onSet]) => (
              <div key={key}>
                <label htmlFor={`${uid}-${key}`} className="label-mono" style={{ display: "block", marginBottom: 4, color: "var(--color-dark-dim)" }}>{label}</label>
                <input
                  id={`${uid}-${key}`}
                  type="number"
                  className="editor-inset"
                  inputMode="decimal"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onSet(v); }}
                  style={numInput}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-outline-dark btn-sm" onClick={() => set({ zoom: crop.zoom - 0.05 })} aria-label="Zoom out" style={{ minHeight: 44, minWidth: 44, padding: "0 16px" }}>−</button>
            <button type="button" className="btn-outline-dark btn-sm" onClick={() => set({ zoom: crop.zoom + 0.05 })} aria-label="Zoom in" style={{ minHeight: 44, minWidth: 44, padding: "0 16px" }}>+</button>
          </div>
          <p role="status" style={{ margin: 0, minHeight: 20, fontSize: 13, color: "var(--color-am)" }}>
            {faceOut ? <><span aria-hidden="true">⚠ </span>Your face will be partly out of frame.</> : ""}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
