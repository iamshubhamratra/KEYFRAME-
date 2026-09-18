import { useId } from "react";
import { LANGUAGES } from "../brand.js";

// Caption language picker: a native <select> (best keyboard + screen-reader support, and the OS
// picker on phones) listing every language by English and native name, each option tagged with
// its `lang` and `dir` so Arabic reads right-to-left and Hindi/Japanese get the right font.
export default function LanguageSelect({
  value = "auto",
  onChange,
  label = "Caption language",
  hideLabel = false,
  id,
  includeAuto = true,
  autoLabel = "Auto — match what I say",
  languages = LANGUAGES,
  hint,
  warning,
  disabled = false,
  onDark = true,
}) {
  const autoId = useId();
  const selectId = id || `kf-lang-${autoId}`;
  const hintId = `${selectId}-hint`;
  const describedBy = hint || warning ? hintId : undefined;
  const dim = onDark ? "var(--color-dark-dim)" : "var(--color-dim)";

  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={selectId} className={hideLabel ? "sr-only" : "label-mono"} style={hideLabel ? undefined : { display: "block", marginBottom: 8, color: dim }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <select
          id={selectId}
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(e) => onChange?.(e.target.value)}
          className={onDark ? "editor-inset" : "inset-field"}
          style={{
            width: "100%", minHeight: 44, boxSizing: "border-box", padding: "10px 40px 10px 14px",
            appearance: "none", WebkitAppearance: "none", cursor: disabled ? "not-allowed" : "pointer",
            fontFamily: "var(--font-mono)", fontSize: 13, opacity: disabled ? 0.5 : 1,
            colorScheme: onDark ? "dark" : "light",
          }}
        >
          {includeAuto && <option value="auto">{autoLabel}</option>}
          {languages.map((l) => (
            <option key={l.code} value={l.code} lang={l.code} dir={l.dir}>
              {l.name === l.native ? l.name : `${l.name} — ${l.native}`}
            </option>
          ))}
        </select>
        <span aria-hidden="true" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: dim }}>▼</span>
      </div>
      {(hint || warning) && (
        <p id={hintId} style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.5, color: warning ? (onDark ? "var(--color-am)" : "var(--color-ink)") : dim }}>
          {warning ? <><span aria-hidden="true">⚠ </span>{warning}</> : hint}
        </p>
      )}
    </div>
  );
}
