import { useEffect, useId, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Modal dialog on the native <dialog> element: showModal() gives the top layer, inert background,
// focus containment and Esc for free. We add: Esc/backdrop call onClose (the parent owns `open`),
// focus goes to initialFocusRef (or the browser's first focusable) and returns to the opener,
// page scroll is locked while open, and variant="sheet" docks to the bottom under 860 px.
const CSS = `
dialog[data-kf-dialog]{margin:auto;padding:0;border:0;background:transparent;max-width:min(var(--kf-dialog-w,560px),calc(100vw - 32px));width:100%;max-height:calc(100dvh - 32px);overflow:visible;color:inherit}
dialog[data-kf-dialog]::backdrop{background:rgba(13,11,7,.62);backdrop-filter:blur(4px)}
@media (max-width:859px){dialog[data-kf-dialog][data-variant=sheet]{margin:auto 0 0;max-width:100vw;width:100vw;max-height:88dvh}
dialog[data-kf-dialog][data-variant=sheet] .kf-dialog-panel{border-radius:22px 22px 0 0;padding-bottom:env(safe-area-inset-bottom)}}
`;

export default function Dialog({
  open,
  onClose,
  title,
  description,
  scene,
  children,
  actions,
  variant = "center",
  width = 560,
  onDark = true,
  dismissable = true,
  initialFocusRef,
  closeLabel = "Close",
  hideTitle = false,
}) {
  const ref = useRef(null);
  const titleId = useId();
  const descId = useId();
  const reduce = useReducedMotion();

  useEffect(() => {
    const dlg = ref.current;
    if (!open || !dlg) return undefined;
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    if (!dlg.open) {
      try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); }
    }
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    const target = initialFocusRef?.current;
    if (target && typeof target.focus === "function") target.focus();
    return () => {
      root.style.overflow = prevOverflow;
      if (dlg.open) {
        try { dlg.close(); } catch { dlg.removeAttribute("open"); }
      }
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, initialFocusRef]);

  const ink = onDark ? "var(--color-dark-ink)" : "var(--color-ink)";
  const dim = onDark ? "var(--color-dark-dim)" : "var(--color-dim)";

  return (
    <dialog
      ref={ref}
      data-kf-dialog=""
      data-variant={variant}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => { e.preventDefault(); if (dismissable) onClose?.("escape"); }}
      onClick={(e) => { if (e.target === e.currentTarget && dismissable) onClose?.("backdrop"); }}
      style={{ "--kf-dialog-w": `${width}px` }}
    >
      <style href="kf-dialog-styles" precedence="kf">{CSS}</style>
      {open && (
        <motion.div
          className={`kf-dialog-panel ${onDark ? "editor-card" : "card"}`}
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 32px)", color: ink, overflow: "hidden" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 12px 0 22px" }}>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 8 }}>
              {scene && <span className="scene-pill" style={{ "--tagc": "var(--color-mag)", marginBottom: 10 }}>{scene}</span>}
              {title && (
                <h2 id={titleId} className={hideTitle ? "sr-only" : undefined} style={hideTitle ? undefined : { margin: scene ? "10px 0 0" : 0, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(20px,2.6vw,26px)", letterSpacing: "-0.02em", lineHeight: 1.1, color: ink }}>
                  {title}
                </h2>
              )}
              {description && <p id={descId} style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: dim }}>{description}</p>}
            </div>
            {dismissable && (
              <button
                type="button"
                onClick={() => onClose?.("button")}
                aria-label={closeLabel}
                style={{ width: 44, height: 44, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 999, border: 0, background: "transparent", cursor: "pointer", color: dim, fontSize: 18 }}
              >
                <span aria-hidden="true">✕</span>
              </button>
            )}
          </div>
          <div style={{ padding: "16px 22px 20px", overflowY: "auto", minHeight: 0 }}>{children}</div>
          {actions && (
            <div style={{ padding: "14px 22px 20px", display: "flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 10, borderTop: `1px solid ${onDark ? "rgba(242,237,226,.08)" : "rgba(23,19,14,.08)"}` }}>
              {actions}
            </div>
          )}
        </motion.div>
      )}
    </dialog>
  );
}
