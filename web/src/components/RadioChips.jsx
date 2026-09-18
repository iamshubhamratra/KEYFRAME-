import { useId, useRef } from "react";

// A single-choice group drawn as mono chips (or tiles), with the full ARIA radio pattern:
// role="radiogroup" / role="radio", one tab stop (roving tabindex on the checked option), arrows
// move AND select, Home/End jump to the ends, disabled options are skipped. Every option is at
// least 44 px tall. `renderOption(option, checked)` lets a caller draw swatches inside a tile.
export default function RadioChips({
  label,
  labelledBy,
  hideLabel = false,
  describedBy,
  value,
  options = [],
  onChange,
  onDark = true,
  variant = "chip",
  disabled = false,
  columns,
  renderOption,
  id,
}) {
  const autoId = useId();
  const groupId = id || `kf-radio-${autoId}`;
  const labelId = `${groupId}-label`;
  const refs = useRef([]);

  const enabledIdx = options.map((o, i) => (o.disabled || disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIdx = options.findIndex((o) => o.value === value);
  const tabStop = selectedIdx >= 0 && !options[selectedIdx]?.disabled ? selectedIdx : enabledIdx[0] ?? -1;

  const choose = (i) => {
    const o = options[i];
    if (!o || o.disabled || disabled) return;
    if (o.value !== value) onChange?.(o.value, o);
  };

  const onKeyDown = (e, i) => {
    if (!enabledIdx.length) return;
    const pos = enabledIdx.indexOf(i);
    let next;
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": next = enabledIdx[(pos + 1) % enabledIdx.length]; break;
      case "ArrowLeft": case "ArrowUp": next = enabledIdx[(pos - 1 + enabledIdx.length) % enabledIdx.length]; break;
      case "Home": next = enabledIdx[0]; break;
      case "End": next = enabledIdx[enabledIdx.length - 1]; break;
      default: return;
    }
    e.preventDefault();
    choose(next);
    refs.current[next]?.focus();
  };

  const ink = onDark ? "var(--color-dark-ink)" : "var(--color-ink)";
  const dim = onDark ? "var(--color-dark-dim)" : "var(--color-dim)";
  const tile = variant === "tile";

  return (
    <div style={{ minWidth: 0 }}>
      {label && (
        <div id={labelId} className={hideLabel ? "sr-only" : "label-mono"} style={hideLabel ? undefined : { marginBottom: 8, color: dim }}>
          {label}
        </div>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : labelledBy}
        aria-describedby={describedBy}
        aria-disabled={disabled || undefined}
        style={tile
          ? { display: "grid", gridTemplateColumns: columns ? `repeat(${columns}, minmax(0, 1fr))` : "repeat(auto-fill, minmax(112px, 1fr))", gap: 8 }
          : { display: "flex", flexWrap: "wrap", gap: 8 }}
      >
        {options.map((o, i) => {
          const checked = i === selectedIdx;
          const isDisabled = disabled || !!o.disabled;
          const common = {
            ref: (el) => { refs.current[i] = el; },
            type: "button",
            role: "radio",
            "aria-checked": checked,
            "aria-disabled": isDisabled || undefined,
            "aria-label": o.ariaLabel,
            tabIndex: i === tabStop ? 0 : -1,
            onClick: () => choose(i),
            onKeyDown: (e) => onKeyDown(e, i),
            title: o.title,
          };
          if (tile) {
            return (
              <button
                key={String(o.value)}
                {...common}
                style={{
                  minHeight: 44, minWidth: 0, padding: "10px 12px", borderRadius: 12, textAlign: "left",
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
                  cursor: isDisabled ? "not-allowed" : "pointer", opacity: isDisabled ? 0.45 : 1,
                  background: checked ? (onDark ? "rgba(242,237,226,.08)" : "var(--color-paper-2)") : "transparent",
                  border: `1.5px solid ${checked ? (o.color || (onDark ? "var(--color-cy)" : "var(--color-ink)")) : onDark ? "rgba(242,237,226,.16)" : "rgba(23,19,14,.18)"}`,
                  color: ink, transition: "border-color .2s ease, background .2s ease",
                }}
              >
                {renderOption ? renderOption(o, checked) : (
                  <>
                    {o.w && o.h && (
                      <span aria-hidden="true" style={{ width: o.w, height: o.h, borderRadius: 3, border: `2px solid ${checked ? (o.color || (onDark ? "var(--color-cy)" : "var(--color-ink)")) : dim}` }} />
                    )}
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: ink }}>
                      <span aria-hidden="true" style={{ width: 12, color: o.color || (onDark ? "var(--color-cy)" : "var(--color-ink)") }}>{checked ? "✓" : ""}</span>
                      {o.label}
                    </span>
                    {o.sub && <span style={{ fontSize: 12, lineHeight: 1.35, color: dim }}>{o.sub}</span>}
                  </>
                )}
              </button>
            );
          }
          const chipColor = o.color || (onDark ? "rgba(242,237,226,.85)" : "rgba(23,19,14,.55)");
          return (
            <button
              key={String(o.value)}
              {...common}
              className={`chip-c ${onDark ? "" : "on-paper"} ${checked ? "is-active" : ""}`}
              style={{
                "--chipc": chipColor,
                minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 14px",
                cursor: isDisabled ? "not-allowed" : "pointer", opacity: isDisabled ? 0.45 : 1,
                ...(checked && !onDark && !o.color ? { background: "var(--color-ink)", borderColor: "var(--color-ink)", color: "#f2ede2" } : {}),
                ...(checked && onDark && !o.color ? { color: "var(--color-ink)" } : {}),
              }}
            >
              {renderOption ? renderOption(o, checked) : o.label}
              {o.sub && <span style={{ opacity: onDark ? 0.8 : 1, textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-body)" }}>{o.sub}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
