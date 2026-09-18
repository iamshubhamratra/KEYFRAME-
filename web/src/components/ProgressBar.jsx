import { useReducedMotion } from "framer-motion";

// The v2 magenta→amber progress rail with progressbar semantics. aria-valuetext carries the
// human line ("UPLOADING 42% · 180/430 MB"). Screen readers hear quartiles (25/50/75/100) from a
// polite region whose text only changes when the quartile does — no per-percent chatter.
// Indeterminate mode ("CHECKING THE FOOTAGE…") slides a segment; with reduced motion it shows a
// still hatched rail instead of an animation that would freeze off-screen.
export default function ProgressBar({
  value = 0,
  label = "Progress",
  valueText,
  indeterminate = false,
  announce = true,
  onDark = true,
  height = 6,
  showValue = false,
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const quartile = indeterminate ? 0 : Math.floor(pct / 25) * 25;
  const rail = onDark ? "rgba(242,237,226,.08)" : "rgba(23,19,14,.08)";
  const fill = "linear-gradient(90deg, var(--color-mag), var(--color-am))";

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : Math.round(pct)}
          aria-valuetext={valueText || (indeterminate ? `${label}…` : `${Math.round(pct)}%`)}
          aria-busy={indeterminate || pct < 100 ? true : undefined}
          style={{ position: "relative", flex: 1, height, borderRadius: 999, background: rail, overflow: "hidden" }}
        >
          {indeterminate ? (
            reduce ? (
              <span style={{ position: "absolute", inset: 0, borderRadius: 999, opacity: 0.55, background: "repeating-linear-gradient(135deg, var(--color-mag) 0 6px, transparent 6px 12px)" }} />
            ) : (
              <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "40%", borderRadius: 999, background: fill, animation: "kf-slidebar 1.3s cubic-bezier(.16,1,.3,1) infinite" }} />
            )
          ) : (
            <span
              style={{
                position: "absolute", inset: 0, borderRadius: 999, background: fill,
                transformOrigin: "left center", transform: `scaleX(${pct / 100})`,
                transition: reduce ? "none" : "transform .45s cubic-bezier(.16,1,.3,1)",
              }}
            />
          )}
        </div>
        {showValue && !indeterminate && (
          <span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right", color: onDark ? "var(--color-dark-ink)" : "var(--color-ink)" }}>
            {Math.floor(pct)}%
          </span>
        )}
      </div>
      {announce && (
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {quartile >= 25 ? `${label} ${quartile}%` : ""}
        </span>
      )}
    </div>
  );
}
