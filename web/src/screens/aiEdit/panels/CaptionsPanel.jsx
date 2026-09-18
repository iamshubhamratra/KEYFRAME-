import { useId } from "react";
import { useEditor, useEditorActions } from "../../../editState.js";
import { findItem } from "../../../editModel.js";
import { CAPTION_STYLE_OPTIONS, WORDS_PER_LINE_OPTIONS, fmtTcShort } from "../../../editFormat.js";
import { languageMeta } from "../../../brand.js";
import RadioChips from "../../../components/RadioChips.jsx";
import Switch from "../../../components/Switch.jsx";
import LanguageSelect from "../../../components/LanguageSelect.jsx";
import ItemCard, { ActionButton, PanelSection, RangeField, TextField, CostHint } from "../ItemCard.jsx";
import { PaletteField } from "./BrandingPanel.jsx";

// CAPTIONS (UX.md §1d panel 2) — the track's switch, style, words per line, language (with a warning
// when captions would be machine-translated), height inside the safe band and palette; then every
// cue as a card with its text in an <input dir="auto"> (Enter/blur saves and re-times only that
// cue, Esc reverts), emphasis word chips on the selected cue, Hide/Show and its word provenance.

const DEFAULT_Y = { top: 0.16, center: 0.5, bottom: 0.8, auto: 0.74 };
const STYLE_TILES = CAPTION_STYLE_OPTIONS.filter((o) => o.value !== "off");

function EmphasisChips({ cue }) {
  const f = useEditorActions();
  const labelId = useId();
  const words = (cue.words || []).filter((w) => !w.collapsed);
  return (
    <div>
      <div id={labelId} className="label-mono" style={{ marginBottom: 6, color: "var(--color-dark-dim)" }}>EMPHASIS · TAP WORDS TO POP THEM</div>
      <div role="group" aria-labelledby={labelId} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {words.map((w) => (
          <button
            key={w.key}
            type="button"
            className="chip-c"
            aria-pressed={!!w.emphasis}
            onClick={() => {
              const r = f.apply({ type: "caption.setEmphasis", cueId: cue.id, wordKey: w.key, emphasis: !w.emphasis });
              if (!r.ok) f.toast({ tone: "error", message: r.reason });
            }}
            style={{
              "--chipc": w.emphasis ? "var(--color-am)" : "rgba(242,237,226,.55)", minHeight: 44, padding: "6px 12px",
              fontFamily: "var(--font-body)", fontSize: 13, letterSpacing: 0, textTransform: "none",
              ...(w.emphasis ? { background: "var(--color-am)", color: "var(--color-ink)" } : {}),
            }}
          >
            {w.text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CueCard({ cueId, layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const selection = useEditor((s) => s.selection);
  const cue = findItem(plan, "caption", cueId);
  if (!cue) return null;
  const r = cue.resolved || { outIn: 0, outOut: 0 };
  const lang = plan.captions?.language || plan.source?.language;
  const selected = selection?.kind === "caption" && selection.id === cueId;
  const collapsed = !!cue.resolved?.collapsed;
  const save = (text) => {
    const res = f.apply({ type: "caption.editText", cueId, text });
    if (res.ok) f.toast({ message: `Caption saved · rendering ${fmtTcShort(r.outIn)}–${fmtTcShort(r.outOut)}` });
    return res;
  };
  return (
    <ItemCard
      kind="caption"
      id={cueId}
      layout={layout}
      compact
      dim={cue.hidden || collapsed}
      status={collapsed ? { label: "CUT WITH ITS WORDS", tone: "dim" } : cue.hidden ? { label: "HIDDEN", tone: "dim" } : cue.edited ? { label: "EDITED", tone: "mag" } : null}
      actions={
        <>
          {cue.hidden
            ? <ActionButton onClick={() => f.apply({ type: "caption.show", cueId })}>Show</ActionButton>
            : <ActionButton onClick={() => f.removeItem("caption", cueId)} keyshortcuts="Delete" disabled={collapsed}>Hide</ActionButton>}
          <span style={{ alignSelf: "center" }}><CostHint op={{ type: "caption.editText" }} /></span>
        </>
      }
    >
      <TextField
        ariaLabel={`Caption at ${fmtTcShort(r.outIn)}`}
        value={cue.text}
        onSave={save}
        maxLength={120}
        counter={false}
        lang={lang}
        dir="auto"
        disabled={cue.hidden || collapsed}
        size="lg"
      />
      {selected && !cue.hidden && !collapsed && <EmphasisChips cue={cue} />}
    </ItemCard>
  );
}

export default function CaptionsPanel({ layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const cap = plan?.captions;
  if (!cap) return <p style={{ margin: 0, color: "var(--color-dark-dim)" }}>This edit has no caption track.</p>;

  const enabled = cap.enabled !== false;
  const styleId = cap.styleId;
  const wpl = plan.settings?.maxWordsPerLine ?? 2;
  const lang = plan.settings?.captionLanguage || "auto";
  const spoken = cap.sourceLanguage || plan.source?.language;
  const translated = lang !== "auto" && lang !== spoken;
  const y = cap.position?.yOverride ?? DEFAULT_Y[cap.position?.policy] ?? 0.74;
  const cues = cap.cues || [];
  const apply = (op, message) => {
    const r = f.apply(op);
    if (!r.ok) f.toast({ tone: "error", message: r.reason });
    else if (message) f.toast({ message });
    return r;
  };

  return (
    <div>
      <PanelSection first title="CAPTION TRACK" aside={<CostHint op={{ type: "captions.setStyle" }} />}>
        <Switch label="Burned-in captions" checked={enabled} onChange={(v) => apply({ type: "captions.setEnabled", enabled: v })} />
        <RadioChips label="Style" variant="tile" columns={2} value={styleId} options={STYLE_TILES} disabled={!enabled} onChange={(v) => apply({ type: "captions.setStyle", styleId: v, maxWordsPerLine: wpl })} />
        <RadioChips label="Words per line" value={wpl} options={WORDS_PER_LINE_OPTIONS} disabled={!enabled} onChange={(v) => apply({ type: "captions.setStyle", styleId, maxWordsPerLine: v })} />
        <div style={{ display: "grid", gap: 6 }}>
          <LanguageSelect
            value={lang}
            disabled={!enabled}
            onChange={(v) => apply({ type: "captions.setLanguage", language: v }, v === "auto" || v === spoken ? null : `Translating captions to ${languageMeta(v)?.name || v} · 1 AI call`)}
            warning={translated ? "Translated captions are machine-made — check them before you export." : undefined}
            hint={translated ? undefined : "Auto keeps captions in the language you speak."}
          />
          <CostHint text="ANOTHER LANGUAGE · 1 AI CALL" />
        </div>
        <RangeField label="Caption height" min={10} max={90} step={1} value={Math.round(y * 100)} format={(v) => `${Math.round(v)}% down the frame`} onChange={(v) => apply({ type: "captions.setPosition", y: v / 100 })} disabled={!enabled} hint="Kept inside the platform's safe zone." />
        <PaletteField label="Caption colours" />
      </PanelSection>

      <PanelSection title={`CUES · ${cues.length}`}>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {cues.map((c) => <li key={c.id}><CueCard cueId={c.id} layout={layout} /></li>)}
        </ol>
      </PanelSection>
    </div>
  );
}
