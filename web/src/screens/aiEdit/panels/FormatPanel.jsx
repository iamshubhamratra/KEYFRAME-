import { useState } from "react";
import { useEditor, useEditorActions } from "../../../editState.js";
import { findItem } from "../../../editModel.js";
import { FORMAT_OPTIONS } from "../../../editFormat.js";
import RadioChips from "../../../components/RadioChips.jsx";
import ItemCard, { ActionButton, PanelSection, CostHint } from "../ItemCard.jsx";

// FORMAT (UX.md §1d panel 7) — the output aspect (choose, then confirm: "Re-frame for 16:9?"; every
// shot is re-framed from the stored face track and captions re-laid, no re-analysis) and each shot
// with its framing — auto (follows the face) or a custom crop set in the Reframe dialog.

const ASPECTS = FORMAT_OPTIONS.filter((o) => o.value !== "source");

export function SegmentCard({ id, layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const seg = findItem(plan, "segment", id);
  if (!seg) return null;
  const crop = seg.framing?.userCrop;
  return (
    <ItemCard
      kind="segment"
      id={id}
      layout={layout}
      status={crop ? { label: "CUSTOM CROP", tone: "mag" } : null}
      actions={
        <>
          <ActionButton haspopup="dialog" onClick={() => f.openDialog("reframe", { segmentId: id })} cost={{ type: "framing.adjust" }}>Reframe shot</ActionButton>
          {crop && <ActionButton onClick={() => f.apply({ type: "framing.reset", segmentId: id })}>Auto — follow face</ActionButton>}
        </>
      }
    >
      <p className="label-mono" style={{ margin: 0, color: "var(--color-dark-dim)" }}>
        {crop ? `X ${Math.round(crop.cx * 100)}% · Y ${Math.round(crop.cy * 100)}% · ${Number(crop.zoom || 1).toFixed(2)}×` : "AUTO — FOLLOWS YOUR FACE"}
      </p>
    </ItemCard>
  );
}

export default function FormatPanel({ layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const [draft, setDraft] = useState(null);
  if (!plan) return null;
  const current = plan.output?.aspect || "9:16";
  const choice = draft ?? current;
  const changing = !!draft && draft !== current;
  const segments = plan.aRoll?.segments || [];

  const confirm = () => f.openDialog("confirm", {
    title: `Re-frame for ${draft}?`,
    body: "Every shot is re-framed and captions re-laid. Your edits are kept.",
    confirmLabel: `Re-frame for ${draft}`,
    ops: [{ type: "output.setAspect", aspect: draft }],
    toast: `Re-framing for ${draft} · update the preview when you're ready (about a minute)`,
  });

  return (
    <div>
      <PanelSection first title="OUTPUT FORMAT" aside={<span className="label-mono" style={{ color: "var(--color-dark-dim)" }}>{plan.output?.width}×{plan.output?.height} · {plan.output?.fps || 30}FPS</span>}>
        <RadioChips label="Aspect" variant="tile" columns={3} value={choice} options={ASPECTS} onChange={(v) => setDraft(v)} />
        {changing && (
          <div role="status" style={{ display: "grid", gap: 10, padding: 12, borderRadius: 12, border: "1px solid rgba(232,50,168,.35)", background: "rgba(232,50,168,.06)" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--color-dark-ink)" }}>Changing from {current} to {draft} re-frames every shot. A preview update takes about a minute.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button type="button" className="btn-ink on-dark" aria-haspopup="dialog" onClick={confirm} style={{ minHeight: 44 }}>Re-frame for {draft} →</button>
              <button type="button" className="link-mono on-dark" onClick={() => setDraft(null)} style={{ minHeight: 44 }}>Keep {current}</button>
              <CostHint op={{ type: "output.setAspect" }} />
            </div>
          </div>
        )}
      </PanelSection>
      <PanelSection title={`SHOTS · ${segments.length}`}>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {segments.map((s) => <li key={s.id}><SegmentCard id={s.id} layout={layout} /></li>)}
        </ol>
      </PanelSection>
    </div>
  );
}
