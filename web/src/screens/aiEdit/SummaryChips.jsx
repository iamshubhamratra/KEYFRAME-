import { useId } from "react";
import { useEditor, useEditorActions, PANEL_LABELS } from "../../editState.js";
import { summarize } from "../../editModel.js";

// AI EDIT SUMMARY (UX.md §1d) — what the AI did, as a row of chips whose counts come straight from
// outline.summary. Each chip is a button that opens the panel where that decision can be changed
// (aria-controls points at the panel); off states read "○ MUSIC OFF". The QA badge opens the
// quality-check findings.
export default function SummaryChips({ onChip }) {
  const f = useEditorActions();
  const outline = useEditor((s) => s.outline);
  const findings = useEditor((s) => s.plan?.qa?.findings);
  const counts = useEditor((s) => s.view?.qaSummary?.counts);
  const panel = useEditor((s) => s.panel);
  const headId = useId();

  const qaFromPlan = Array.isArray(findings) ? findings.filter((x) => x.severity === "warn" || x.severity === "fail" || x.severity === "error").length : 0;
  const qaCount = qaFromPlan || (counts ? (Number(counts.warn) || 0) + (Number(counts.fail) || 0) : 0);
  const chips = summarize(outline, { qaCount });
  if (!chips.length) return null;

  return (
    <div style={{ minWidth: 0 }}>
      <h2 id={headId} className="label-mono" style={{ margin: "0 0 10px", color: "var(--color-dark-dim)", fontWeight: 500 }}>AI EDIT SUMMARY</h2>
      <ul aria-labelledby={headId} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {chips.map((chip) => {
          const color = chip.warn ? "var(--color-am)" : chip.on ? "var(--color-lm)" : "var(--color-dark-dim)";
          const target = chip.panel ? `kf-panel-${chip.panel}` : undefined;
          const current = chip.panel && chip.panel === panel;
          return (
            <li key={chip.key}>
              <button
                type="button"
                className="chip-c"
                aria-controls={target}
                aria-haspopup={chip.warn ? "dialog" : undefined}
                aria-label={chip.warn ? `${chip.text} quality ${Number(chip.text) === 1 ? "note" : "notes"} — open quality check` : `${chip.text}${chip.on ? "" : ""} — open ${PANEL_LABELS[chip.panel]}`}
                onClick={() => { if (onChip) onChip(chip); else if (chip.panel) f.setPanel(chip.panel); }}
                style={{
                  "--chipc": color, minHeight: 44, display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 13px",
                  background: current ? "rgba(242,237,226,.06)" : "transparent",
                  borderStyle: chip.on || chip.warn ? "solid" : "dashed",
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 11 }}>{chip.glyph}</span>
                <span>{chip.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
