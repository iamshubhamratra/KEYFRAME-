import { useId } from "react";

// An on/off control with real switch semantics (role="switch" + aria-checked), a 44 px hit area
// around a 44×24 track, and an optional visible label that is also its accessible name. The knob
// position — not only the colour — carries the state.
export default function Switch({
  checked = false,
  onChange,
  label,
  description,
  id,
  labelledBy,
  ariaLabel,
  disabled = false,
  onDark = true,
  accent = "var(--color-mag)",
  stateText = false,
}) {
  const autoId = useId();
  const switchId = id || `kf-switch-${autoId}`;
  const labelId = `${switchId}-label`;
  const descId = `${switchId}-desc`;
  const on = !!checked;

  const control = (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-checked={on}
      aria-labelledby={label ? labelId : labelledBy}
      aria-label={!label && !labelledBy ? ariaLabel : undefined}
      aria-describedby={description ? descId : undefined}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      style={{
        minWidth: 44, minHeight: 44, flexShrink: 0, padding: 0, border: 0, background: "transparent",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        cursor: disabled ? "not-allowed" : "pointer", borderRadius: 999,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "relative", width: 44, height: 24, borderRadius: 999, flexShrink: 0,
          background: on ? accent : onDark ? "rgba(242,237,226,.10)" : "var(--color-paper-2)",
          border: `1px solid ${on ? accent : onDark ? "rgba(242,237,226,.30)" : "rgba(23,19,14,.25)"}`,
          opacity: disabled ? 0.45 : 1,
          transition: "background .25s ease, border-color .25s ease",
        }}
      >
        <span
          style={{
            position: "absolute", top: 2, left: 2, width: 18, height: 18, borderRadius: "50%",
            background: on || !onDark ? "#fff" : "var(--color-dark-ink)",
            boxShadow: "0 1px 3px rgba(0,0,0,.35)",
            transform: on ? "translateX(20px)" : "translateX(0)",
            transition: "transform .25s cubic-bezier(.16,1,.3,1)",
          }}
        />
      </span>
      {stateText && (
        <span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", minWidth: 24, textAlign: "left", color: onDark ? "var(--color-dark-dim)" : "var(--color-dim)" }}>
          {on ? "ON" : "OFF"}
        </span>
      )}
    </button>
  );

  if (!label) return control;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <label
          id={labelId}
          htmlFor={switchId}
          style={{
            display: "block", cursor: disabled ? "not-allowed" : "pointer",
            fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
            color: onDark ? "var(--color-dark-ink)" : "var(--color-ink)", lineHeight: 1.4,
          }}
        >
          {label}
        </label>
        {description && (
          <span id={descId} style={{ display: "block", marginTop: 3, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", lineHeight: 1.5, color: onDark ? "var(--color-dark-dim)" : "var(--color-dim)", textTransform: "uppercase" }}>
            {description}
          </span>
        )}
      </div>
      {control}
    </div>
  );
}
