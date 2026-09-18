import { useId, useState } from "react";
import { useEditor, useEditorActions } from "../../editState.js";
import { provenanceLines, itemHead, costHint, SEGMENT_COLORS } from "../../editFormat.js";
import { anchoredWords, findItem } from "../../editModel.js";
import { RichText } from "../../components/EditNotice.jsx";

// ITEM CARD (UX.md §1d) — one AI decision on a card: what it is and where it sits
// (`B-ROLL #3 · 00:27–00:29 · FULL`), who made it (AI / YOU / LOCKED), why it exists (the provenance
// line tied to the transcript), what it will cost to change, and whether the preview shows it yet.
// Every panel draws its items with this card; the head is a real button that selects the item and
// seeks the player to it. Also exports the small furniture the panels share (sections, sliders,
// text fields that save on Enter/blur, action chips with cost hints).

const KIND_COLOR = {
  broll: "var(--color-cy)",
  caption: "var(--color-dark-ink)",
  effect: "var(--color-am)",
  graphic: "var(--color-mag)",
  transition: "var(--color-am)",
  cut: "var(--color-rec)",
  music: "var(--color-lm)",
  sfx: "var(--color-lm)",
  logo: "var(--color-cb)",
};

const TONE_COLOR = {
  warn: "var(--color-am)",
  error: "#ff6a3c",
  info: "var(--color-cy)",
  success: "var(--color-lm)",
  mag: "var(--color-mag)",
  dim: "var(--color-dark-dim)",
};

const mono = (size = 10, extra = {}) => ({ fontFamily: "var(--font-mono)", fontSize: size, letterSpacing: "0.16em", textTransform: "uppercase", ...extra });

export function StatusPill({ label, tone = "dim", hatched = false, live = false }) {
  const c = TONE_COLOR[tone] || tone;
  return (
    <span
      style={{
        ...mono(9, { letterSpacing: "0.14em" }),
        display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap",
        padding: "3px 8px", borderRadius: 999, color: "var(--color-dark-ink)",
        border: `1px solid color-mix(in srgb, ${c} 55%, transparent)`,
        background: hatched
          ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${c} 30%, transparent) 0 4px, transparent 4px 8px)`
          : `color-mix(in srgb, ${c} 14%, transparent)`,
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: c, animation: live ? "kf2-blink 1s steps(1) infinite" : "none" }} />
      {label}
    </span>
  );
}

export function CostHint({ op, text }) {
  const label = text || (op ? costHint(op) : "");
  if (!label) return null;
  return (
    <span style={{ ...mono(9, { letterSpacing: "0.12em" }), color: "var(--color-dark-dim)", whiteSpace: "nowrap" }}>
      <span aria-hidden="true">◆ </span>{label}
    </span>
  );
}

// A mono chip button sized for touch (≥44 px), with an optional cost hint beneath it.
export function ActionButton({ children, onClick, tone, disabled = false, pressed, expanded, controls, haspopup, ariaLabel, keyshortcuts, cost, busy = false, type = "button", title }) {
  const color = tone === "danger" ? "#ff6a3c" : tone === "mag" ? "var(--color-mag)" : tone === "cy" ? "var(--color-cy)" : "rgba(242,237,226,.85)";
  const btn = (
    <button
      type={type}
      className="chip-c"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-haspopup={haspopup}
      aria-label={ariaLabel}
      aria-keyshortcuts={keyshortcuts}
      aria-busy={busy || undefined}
      title={title}
      style={{
        "--chipc": color, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "6px 14px", opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer",
        ...(pressed ? { background: color, color: "var(--color-ink)" } : {}),
      }}
    >
      {children}
    </button>
  );
  if (!cost) return btn;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      {btn}
      <CostHint op={typeof cost === "string" ? null : cost} text={typeof cost === "string" ? cost : undefined} />
    </span>
  );
}

export function PanelSection({ title, aside, children, first = false }) {
  const headId = useId();
  return (
    <section aria-labelledby={headId} style={{ paddingTop: first ? 0 : 18, marginTop: first ? 0 : 18, borderTop: first ? "none" : "1px solid var(--color-dark-line)", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h3 id={headId} style={{ margin: 0, ...mono(10, { letterSpacing: "0.2em", fontWeight: 500 }), color: "var(--color-dark-dim)" }}>{title}</h3>
        {aside}
      </div>
      <div style={{ display: "grid", gap: 12, minWidth: 0 }}>{children}</div>
    </section>
  );
}

// Native range input (best keyboard + AT support) with a visible value and aria-valuetext. Arrow keys
// belong to the slider (data-kf-zone), so editor shortcuts never steal them.
export function RangeField({ label, value, min, max, step = 1, onChange, format = (v) => String(v), disabled = false, hint }) {
  const uid = useId();
  const inputId = `kf-range-${uid}`;
  const [draft, setDraft] = useState(null);
  const shown = draft ?? value;
  return (
    <div data-kf-zone="slider" style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <label htmlFor={inputId} style={{ ...mono(10, { letterSpacing: "0.14em" }), color: "var(--color-dark-dim)" }}>{label}</label>
        <output htmlFor={inputId} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-dark-ink)", fontVariantNumeric: "tabular-nums" }}>{format(shown)}</output>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.round(Number(shown) / step) * step}
        disabled={disabled}
        aria-valuetext={format(shown)}
        onChange={(e) => { const v = Number(e.target.value); setDraft(v); onChange?.(v); }}
        onBlur={() => setDraft(null)}
        onPointerUp={() => setDraft(null)}
        style={{ display: "block", width: "100%", minHeight: 44, margin: 0, accentColor: "var(--color-mag)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1 }}
      />
      {hint && <p style={{ margin: "2px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--color-dark-dim)" }}>{hint}</p>}
    </div>
  );
}

// A text field that saves on Enter or blur and reverts on Esc. onSave(text) may return
// { ok:false, reason } to keep the draft and show the reason beside the field.
export function TextField({ label, value, onSave, maxLength, placeholder, dir = "auto", lang, hideLabel = false, counter = true, ariaLabel, disabled = false, multiline = false, size = "md" }) {
  const uid = useId();
  const inputId = `kf-text-${uid}`;
  const countId = `${inputId}-count`;
  const errId = `${inputId}-err`;
  const base = value ?? "";
  const [draft, setDraft] = useState({ base, text: base });
  const [error, setError] = useState(null);
  if (draft.base !== base) setDraft({ base, text: base });
  const text = draft.text;
  const dirty = text !== base;

  const save = () => {
    if (!dirty) return;
    const r = onSave?.(text);
    if (r && r.ok === false) setError(r.reason || "That couldn't be saved.");
    else setError(null);
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter" && (!multiline || !e.shiftKey)) { e.preventDefault(); save(); return; }
    if (e.key === "Escape" && (dirty || error)) {
      e.preventDefault();
      setDraft({ base, text: base });
      setError(null);
    }
  };
  const Tag = multiline ? "textarea" : "input";
  const describedBy = [counter && maxLength ? countId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div style={{ minWidth: 0 }}>
      {label && (
        <label htmlFor={inputId} className={hideLabel ? "sr-only" : undefined} style={hideLabel ? undefined : { display: "block", marginBottom: 6, ...mono(10, { letterSpacing: "0.14em" }), color: "var(--color-dark-dim)" }}>
          {label}
        </label>
      )}
      <div style={{ position: "relative" }}>
        <Tag
          id={inputId}
          type={multiline ? undefined : "text"}
          dir={dir}
          lang={lang}
          value={text}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={label ? undefined : ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck
          rows={multiline ? 2 : undefined}
          onChange={(e) => { setDraft({ base, text: e.target.value }); if (error) setError(null); }}
          onBlur={save}
          onKeyDown={onKeyDown}
          className="editor-inset"
          style={{
            display: "block", width: "100%", boxSizing: "border-box", minHeight: 44, resize: multiline ? "vertical" : undefined,
            padding: counter && maxLength ? "10px 64px 10px 12px" : "10px 12px",
            fontFamily: "var(--font-body)", fontSize: size === "lg" ? 15 : 14, lineHeight: 1.45,
            opacity: disabled ? 0.5 : 1,
            ...(dirty ? { borderColor: "rgba(232,50,168,.45)" } : {}),
            ...(error ? { borderColor: "#ff6a3c" } : {}),
          }}
        />
        {counter && maxLength && (
          <span id={countId} aria-live="off" style={{ position: "absolute", right: 10, top: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: [...text].length >= maxLength ? "var(--color-am)" : "var(--color-dark-dim)", fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}>
            {[...text].length}/{maxLength}
          </span>
        )}
      </div>
      {error && <p id={errId} role="alert" style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.45, color: "#ff6a3c" }}>{error}</p>}
      {dirty && !error && (
        <p style={{ margin: "5px 0 0", ...mono(9, { letterSpacing: "0.12em" }), color: "var(--color-dark-dim)" }}>ENTER TO SAVE · ESC TO UNDO</p>
      )}
    </div>
  );
}

const ORIGIN = { ai: "AI", heuristic: "AI", user: "YOU" };

// The card. `kind` + `id` locate the item in the current plan; `children` are the specific controls,
// `actions` the buttons, `status` an extra pill ({label, tone, live}). `layout` decides whether
// "Show in transcript" switches to the transcript tab (it has its own column when wide).
export default function ItemCard({ kind, id, status = null, actions = null, children = null, compact = false, layout = "wide", headless = false, dim = false, showProvenance = true, extraLines = null }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const transcript = useEditor((s) => s.transcript);
  const selection = useEditor((s) => s.selection);
  const pending = useEditor((s) => s.pendingItemIds);
  const itemErrors = useEditor((s) => s.itemErrors);
  const headId = useId();
  const item = findItem(plan, kind, id);
  if (!item) return null;

  const errKey = kind === "music" || kind === "logo" ? kind : id;
  const selected = !!selection && selection.kind === kind && selection.id === id;
  const isPending = pending.includes(errKey);
  const error = itemErrors[errKey];
  const head = itemHead({ kind, item }, plan);
  const lines = showProvenance ? provenanceLines({ kind, item }, plan, transcript) : [];
  const range = anchoredWords(plan, kind, item);
  const spine = kind === "segment" ? SEGMENT_COLORS[item.type] || "rgba(242,237,226,.4)" : KIND_COLOR[kind] || "var(--color-dark-dim)";
  const origin = ORIGIN[item.origin] || (item.origin ? String(item.origin).toUpperCase() : null);

  const select = () => f.selectItem({ kind, id }, { source: "card", keepPanel: true });
  const showInTranscript = () => {
    f.selectItem({ kind, id }, { source: "card", keepPanel: true, seek: true });
    if (layout !== "wide") f.setPanel("transcript");
  };

  return (
    <article
      id={`kf-item-${kind}-${id}`}
      aria-labelledby={headId}
      aria-current={selected ? "true" : undefined}
      tabIndex={-1}
      data-selected={selected || undefined}
      className="kf-item-card"
      style={{
        position: "relative", minWidth: 0, overflow: "hidden",
        padding: compact ? "8px 12px 12px 18px" : "10px 14px 14px 20px",
        borderRadius: 14,
        background: selected ? "rgba(232,50,168,.07)" : "rgba(242,237,226,.03)",
        border: `1px solid ${selected ? "rgba(232,50,168,.7)" : "var(--color-dark-line)"}`,
        boxShadow: selected ? "0 0 0 1px rgba(232,50,168,.35)" : "none",
        opacity: dim ? 0.72 : 1,
        transition: "border-color .2s ease, background .2s ease",
      }}
    >
      <span className="spine" style={{ "--spine": spine, width: 4, borderRadius: "14px 0 0 14px", opacity: dim ? 0.5 : 1 }} />
      {!headless && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <button
            type="button"
            id={headId}
            onClick={select}
            title="Select and jump to this moment"
            style={{
              ...mono(10, { letterSpacing: "0.14em" }), color: "var(--color-dark-ink)", background: "transparent", border: 0,
              padding: "0 4px 0 0", minHeight: 44, cursor: "pointer", textAlign: "left", flex: "1 1 auto", minWidth: 0,
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ overflowWrap: "anywhere" }}>{head}</span>
          </button>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {origin && <StatusPill label={origin} tone={item.origin === "user" ? "mag" : "info"} />}
            {item.locked && <StatusPill label="LOCKED" tone="warn" />}
            {isPending && <StatusPill label="PENDING RENDER" tone="mag" hatched />}
            {status && <StatusPill label={status.label} tone={status.tone} live={status.live} />}
          </span>
        </div>
      )}
      {headless && <span id={headId} className="sr-only">{head}</span>}

      {(lines.length > 0 || extraLines) && (
        <div style={{ marginTop: headless ? 0 : 2, display: "grid", gap: 3 }}>
          {lines.map((l, i) => (
            <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: i === 0 ? "var(--color-dark-ink)" : "var(--color-dark-dim)" }}>
              <RichText text={l} />
            </p>
          ))}
          {extraLines}
        </div>
      )}
      {range && !compact && (
        <button type="button" className="link-mono on-dark" onClick={showInTranscript} style={{ marginTop: 8, minHeight: 32, fontSize: 10, paddingBottom: 2 }}>
          Show in transcript
        </button>
      )}

      {children && <div style={{ marginTop: 12, display: "grid", gap: 12, minWidth: 0 }}>{children}</div>}

      {error && (
        <div role="alert" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 6px 12px", borderRadius: 10, border: "1px solid rgba(255,106,60,.45)", background: "rgba(255,106,60,.08)" }}>
          <span style={{ flex: 1, fontSize: 13, lineHeight: 1.45, color: "var(--color-dark-ink)" }}>
            <span aria-hidden="true" style={{ color: "#ff6a3c" }}>✕ </span>{error}
          </span>
          <button type="button" onClick={() => f.dismissItemError(errKey)} aria-label="Dismiss error" style={{ width: 44, height: 44, border: 0, background: "transparent", color: "var(--color-dark-dim)", cursor: "pointer", borderRadius: 999 }}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}

      {actions && <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 8 }}>{actions}</div>}
    </article>
  );
}
