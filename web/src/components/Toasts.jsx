import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RichText } from "./EditNotice.jsx";

// Toast stack. One polite live region for info/success/warn, role="alert" per error; toasts never
// take focus. Timers: 5 s, errors and anything with an action (Undo, Re-apply) ≥ 8 s, paused while
// hovered or focused. Toast: { id, message, title?, tone: info|success|warn|error, action?:
// { label, onAction }, duration?, persist? }. onDismiss(id) removes it.
const SPINES = { info: "var(--color-cy)", success: "var(--color-lm)", warn: "var(--color-am)", error: "var(--color-rec)" };

function ToastItem({ toast, onDismiss, onDark, reduce }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(null);
  const startedAt = useRef(0);
  const tone = toast.tone || "info";
  const base = toast.duration ?? (toast.action || tone === "error" ? 8000 : 5000);
  const duration = toast.action ? Math.max(8000, base) : base;
  const persist = !!toast.persist;

  useEffect(() => {
    if (paused || persist) return undefined;
    if (remaining.current === null) remaining.current = duration;
    startedAt.current = Date.now();
    const timer = setTimeout(() => onDismiss?.(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(600, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, persist, duration, toast.id, onDismiss]);

  const ink = onDark ? "var(--color-dark-ink)" : "var(--color-ink)";
  const dim = onDark ? "var(--color-dark-dim)" : "var(--color-dim)";

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, transition: { duration: 0.18 } }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      role={tone === "error" ? "alert" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}
      className={onDark ? "editor-card" : "card"}
      style={{ position: "relative", pointerEvents: "auto", width: "100%", maxWidth: 480, borderRadius: 14, padding: "10px 6px 10px 20px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 18px 44px rgba(0,0,0,.35)" }}
    >
      <span className="spine" style={{ "--spine": SPINES[tone] || SPINES.info, borderRadius: "14px 0 0 14px" }} />
      <div style={{ flex: 1, minWidth: 0, padding: "4px 0" }}>
        {toast.title && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: dim, marginBottom: 3 }}>{toast.title}</div>
        )}
        <div style={{ fontSize: 14, lineHeight: 1.45, color: ink }}><RichText text={toast.message} /></div>
      </div>
      {toast.action && (
        <button
          type="button"
          className={`btn-ink ${onDark ? "on-dark" : ""}`}
          onClick={() => { toast.action.onAction?.(); onDismiss?.(toast.id); }}
          style={{ minHeight: 44, padding: "8px 16px", fontSize: 13, flexShrink: 0 }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss?.(toast.id)}
        style={{ width: 44, height: 44, flexShrink: 0, display: "grid", placeItems: "center", border: 0, borderRadius: 999, background: "transparent", color: dim, cursor: "pointer", fontSize: 14 }}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </motion.div>
  );
}

export default function Toasts({ toasts = [], onDismiss, onDark = true, bottomOffset = 24 }) {
  const reduce = useReducedMotion();
  const polite = toasts.filter((t) => t.tone !== "error");
  const errors = toasts.filter((t) => t.tone === "error");
  const stack = { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" };

  return (
    <div
      style={{ position: "fixed", zIndex: 70, left: 16, right: 16, bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom))`, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}
    >
      <div style={stack}>
        <AnimatePresence initial={false}>
          {errors.map((t) => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} onDark={onDark} reduce={reduce} />)}
        </AnimatePresence>
      </div>
      <div role="status" aria-live="polite" aria-relevant="additions text" style={stack}>
        <AnimatePresence initial={false}>
          {polite.map((t) => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} onDark={onDark} reduce={reduce} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}
