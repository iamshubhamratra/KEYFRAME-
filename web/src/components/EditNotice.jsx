import { Fragment, useEffect, useId, useRef } from "react";
import { parseRich } from "../editFormat.js";

// Renders copy with **strong** and *emphasis* markers (editFormat.parseRich) as real elements.
export function RichText({ text }) {
  return parseRich(text).map((p, i) => (p.strong
    ? <strong key={i} style={{ fontWeight: 700 }}>{p.text}</strong>
    : p.em ? <em key={i}>{p.text}</em> : <Fragment key={i}>{p.text}</Fragment>));
}

const TONES = {
  error: { spine: "var(--color-rec)", onDark: "#ff6a3c", onPaper: "var(--color-rec)", glyph: "✕" },
  warn: { spine: "var(--color-am)", onDark: "var(--color-am)", onPaper: "var(--color-ink)", glyph: "⚠" },
  info: { spine: "var(--color-cy)", onDark: "var(--color-cy)", onPaper: "var(--color-ink)", glyph: "●" },
  success: { spine: "var(--color-lm)", onDark: "var(--color-lm)", onPaper: "#1e7c34", glyph: "✓" },
};

// A failure / empty / advisory state card (UX.md §1f): dark card, colour spine, mono title, body,
// actions. Errors are role="alert"; warnings and info are role="status". Pass a `notice` from
// editFormat.noticeCopy(key, vars) and handle its action ids in onAction(id), or pass the parts.
export default function EditNotice({
  notice,
  title,
  body,
  tone,
  actions,
  onAction,
  busyAction = null,
  onDark = true,
  compact = false,
  headingLevel = 2,
  focusOnMount = false,
  children,
}) {
  const n = notice || {};
  const t = tone || n.tone || "error";
  const palette = TONES[t] || TONES.error;
  const heading = title ?? n.title;
  const text = body ?? n.body;
  const acts = actions ?? n.actions ?? [];
  const headingId = useId();
  const headingRef = useRef(null);
  const H = `h${Math.min(6, Math.max(2, headingLevel))}`;

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus({ preventScroll: false });
  }, [focusOnMount]);

  return (
    <section
      role={t === "error" ? "alert" : "status"}
      aria-labelledby={headingId}
      className={onDark ? "editor-card" : "card"}
      style={{ position: "relative", padding: compact ? "14px 16px 14px 22px" : "22px 24px 22px 30px", overflow: "hidden", borderRadius: compact ? 14 : 18 }}
    >
      <span className="spine" style={{ "--spine": palette.spine }} />
      <H
        id={headingId}
        ref={headingRef}
        tabIndex={focusOnMount ? -1 : undefined}
        style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: compact ? 10 : 11, letterSpacing: "0.2em", textTransform: "uppercase", color: onDark ? palette.onDark : palette.onPaper }}
      >
        <span aria-hidden="true">{palette.glyph}</span>
        {heading}
      </H>
      {text && (
        <p style={{ margin: "10px 0 0", maxWidth: 620, fontSize: compact ? 13 : 15, lineHeight: 1.6, color: onDark ? "var(--color-dark-ink)" : "var(--color-ink)" }}>
          <RichText text={text} />
        </p>
      )}
      {children}
      {acts.length > 0 && (
        <div style={{ marginTop: compact ? 12 : 18, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          {acts.map((a) => {
            const busy = busyAction === a.id;
            const danger = a.id === "delete";
            const cls = a.primary ? `btn-ink ${onDark ? "on-dark" : ""}` : onDark ? "btn-outline-dark btn-sm" : "btn-chip";
            return (
              <button
                key={a.id}
                type="button"
                className={cls}
                disabled={!!busyAction}
                aria-busy={busy || undefined}
                onClick={() => onAction?.(a.id, a)}
                style={{ minHeight: 44, ...(danger && !a.primary ? { color: onDark ? "#ff6a3c" : "var(--color-rec)", borderColor: onDark ? "rgba(255,106,60,.45)" : "rgba(216,39,27,.4)" } : {}) }}
              >
                {busy ? `${a.label}…` : a.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
