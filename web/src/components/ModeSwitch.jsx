import { GENERATION_MODES, MODE_LABELS } from "../modes.js";

// "Make a film" / "Edit my video" — the studio's two products, switched from the top of Create and
// Upload. A nav landmark (it changes the page), the current one marked aria-current="page".
const OPTIONS = [
  { mode: GENERATION_MODES.TEMPLATE_GENERATION, mark: "film" },
  { mode: GENERATION_MODES.AI_VIDEO_EDIT, mark: "cut" },
];

function Mark({ kind, on }) {
  if (kind === "film") {
    return <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-mag)", boxShadow: on ? "0 0 8px var(--color-mag)" : "none", flexShrink: 0 }} />;
  }
  return (
    <span aria-hidden="true" style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
      <span style={{ width: 4, height: 10, borderRadius: 1, background: on ? "var(--color-cy)" : "currentColor", opacity: on ? 1 : 0.55 }} />
      <span style={{ width: 4, height: 10, borderRadius: 1, background: on ? "var(--color-cy)" : "currentColor", opacity: on ? 1 : 0.55, transform: "translateY(2px)" }} />
    </span>
  );
}

export default function ModeSwitch({ mode, onSelect }) {
  return (
    <nav
      aria-label="Studio mode"
      style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(8px,1.6vw,18px) clamp(16px,4vw,60px) 0", display: "flex" }}
    >
      <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, padding: 4, borderRadius: 999, border: "1px solid rgba(23,19,14,.14)", background: "rgba(244,240,230,.72)", backdropFilter: "blur(8px)" }}>
        {OPTIONS.map((o) => {
          const on = mode === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              className={`btn-chip ${on ? "is-active" : ""}`}
              aria-current={on ? "page" : undefined}
              onClick={() => { if (!on) onSelect?.(o.mode); }}
              style={{ minHeight: 44, padding: "10px 18px", ...(on ? {} : { borderColor: "transparent", background: "transparent" }) }}
            >
              <Mark kind={o.mark} on={on} />
              {MODE_LABELS[o.mode]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
