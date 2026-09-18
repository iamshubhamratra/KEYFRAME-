import { useId, useState } from "react";
import RadioChips from "./RadioChips.jsx";
import { BRAND_PRESETS, KEYFRAME_PALETTE, normalizeHex, paletteChoice, paletteFromPreset } from "../brand.js";

// Brand colours: KEYFRAME's own accents (value null), one of six presets, or a custom primary
// (+ optional secondary). Custom colours are typed as #RRGGBB or picked with the native colour
// well; onChange only fires with a valid palette, and a bad hex shows its error after the field
// loses focus, next to the field.
function Swatch({ a, b, size = 16 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, border: "1px solid rgba(242,237,226,.35)", background: b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : a }} />
  );
}

export default function BrandPalettePicker({ value = null, onChange, label = "Brand colours", onDark = true }) {
  const uid = useId();
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(() => ({
    primary: value?.source === "manual" ? value.primary : "",
    secondary: value?.source === "manual" ? value.secondary || "" : "",
  }));
  const [touched, setTouched] = useState({ primary: false, secondary: false });
  const choice = picking ? "custom" : paletteChoice(value);

  const options = [
    { value: "keyframe", label: KEYFRAME_PALETTE.label, a: KEYFRAME_PALETTE.primary, b: KEYFRAME_PALETTE.secondary, ariaLabel: "KEYFRAME default colours" },
    ...BRAND_PRESETS.map((p) => ({ value: p.id, label: p.label, a: p.primary, b: p.secondary, title: `${p.primary} · ${p.secondary}` })),
    { value: "custom", label: "Custom", a: normalizeHex(draft.primary) || "transparent", b: normalizeHex(draft.secondary) || null },
  ];

  const emit = (next) => {
    const p = normalizeHex(next.primary);
    const s = next.secondary.trim() ? normalizeHex(next.secondary) : null;
    if (p && (!next.secondary.trim() || s)) onChange?.({ primary: p, ...(s ? { secondary: s } : {}), source: "manual" });
  };

  const select = (v) => {
    if (v === "custom") { setPicking(true); emit(draft); return; }
    setPicking(false);
    onChange?.(v === "keyframe" ? null : paletteFromPreset(v));
  };

  const setField = (field, raw) => {
    const next = { ...draft, [field]: raw };
    setDraft(next);
    emit(next);
  };

  const ink = onDark ? "var(--color-dark-ink)" : "var(--color-ink)";
  const dim = onDark ? "var(--color-dark-dim)" : "var(--color-dim)";
  const errColor = onDark ? "#ff6a3c" : "var(--color-rec)";

  return (
    <div style={{ minWidth: 0 }}>
      <RadioChips
        label={label}
        value={choice}
        options={options}
        onChange={select}
        onDark={onDark}
        renderOption={(o) => (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {o.value === "custom" && o.a === "transparent"
              ? <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: "50%", border: `1px dashed ${dim}` }} />
              : <Swatch a={o.a} b={o.b} />}
            {o.label}
          </span>
        )}
      />
      {choice === "custom" && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {[["primary", "Primary colour", true], ["secondary", "Secondary colour (optional)", false]].map(([field, text, required]) => {
            const val = draft[field];
            const valid = !val.trim() ? !required : !!normalizeHex(val);
            const showError = touched[field] && !valid;
            const inputId = `kf-hex-${field}-${uid}`;
            const errId = `${inputId}-err`;
            return (
              <div key={field} style={{ display: "grid", gap: 6 }}>
                <label htmlFor={inputId} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: dim }}>
                  {text}{required && <span aria-hidden="true" style={{ color: "var(--color-mag)" }}> *</span>}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <input
                    type="color"
                    aria-label={`${text} picker`}
                    value={normalizeHex(val) || (field === "primary" ? KEYFRAME_PALETTE.primary : KEYFRAME_PALETTE.secondary)}
                    onChange={(e) => { setField(field, e.target.value); setTouched((t) => ({ ...t, [field]: true })); }}
                    style={{ width: 44, height: 44, padding: 2, flexShrink: 0, borderRadius: 10, cursor: "pointer", background: "transparent", border: `1px solid ${onDark ? "rgba(242,237,226,.2)" : "rgba(23,19,14,.2)"}` }}
                  />
                  <input
                    id={inputId}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={7}
                    placeholder="#RRGGBB"
                    value={val}
                    required={required}
                    aria-invalid={showError || undefined}
                    aria-describedby={showError ? errId : undefined}
                    onChange={(e) => setField(field, e.target.value.trim())}
                    onBlur={() => setTouched((t) => ({ ...t, [field]: true }))}
                    className={onDark ? "editor-inset" : "inset-field"}
                    style={{ flex: "1 1 120px", minWidth: 0, minHeight: 44, boxSizing: "border-box", padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 13, color: ink, ...(showError ? { borderColor: errColor } : {}) }}
                  />
                </div>
                {showError && <span id={errId} style={{ fontSize: 12, color: errColor }}>Use a hex colour like #E832A8.</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
