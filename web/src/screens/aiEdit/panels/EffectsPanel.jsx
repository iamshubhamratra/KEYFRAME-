import { useId } from "react";
import { useEditor, useEditorActions } from "../../../editState.js";
import { findItem, itemRange } from "../../../editModel.js";
import { EFFECTS_OPTIONS, CUT_TRANSITION_OPTIONS, LOOK_OPTIONS, fmtTcShort } from "../../../editFormat.js";
import RadioChips from "../../../components/RadioChips.jsx";
import Switch from "../../../components/Switch.jsx";
import ItemCard, { PanelSection, RangeField, TextField, CostHint } from "../ItemCard.jsx";

// EFFECTS & GRAPHICS (UX.md §1d panel 4) — intensity (a re-plan of untouched AI effects), the
// all-effects switch and auto jump cuts, the transition style laid on every cut, the colour look,
// then each zoom / punch-in with its switch and a 1.05–1.40× zoom, each graphic (hook title,
// keyword, stat, lower third, CTA) with its switch and text fields that count characters against the
// card's limit, and the AI's topic-change transitions with a picker each.

const EFFECT_TITLE = { PUNCH_IN: "Punch-in", PUNCH_OUT: "Punch-out", JUMP_ZOOM: "Jump-cut zoom", ZOOM_EMPHASIS: "Zoom", REFRAME: "Reframe", FREEZE: "Freeze frame", SPEED: "Speed ramp" };
const HAS_ZOOM = { PUNCH_IN: "zoom", JUMP_ZOOM: "zoom", ZOOM_EMPHASIS: "toZoom" };
const GRAPHIC_TITLE = { HOOK_TITLE: "Hook title", KEYWORD: "Keyword card", STAT: "Stat card", LOWER_THIRD: "Lower third", CTA: "Call-to-action card", LOGO_OUTRO: "Logo outro" };
const GRAPHIC_FIELDS = {
  HOOK_TITLE: [["title", "Hook title", 60]],
  LOWER_THIRD: [["title", "Name", 40], ["subtitle", "Role", 50]],
  KEYWORD: [["title", "Keyword", 48], ["subtitle", "Subtitle", 48]],
  STAT: [["value", "Number", 48], ["title", "Label", 48], ["subtitle", "Subtitle", 48]],
  CTA: [["title", "Call to action", 60], ["subtitle", "Subtitle", 60]],
  LOGO_OUTRO: [["title", "Outro text", 48]],
};
const TRANSITIONS = [
  ["CUT", "Cut"], ["CROSSFADE", "Crossfade"], ["ZOOM_IN", "Zoom punch"], ["WHIP_LEFT", "Whip left"], ["WHIP_RIGHT", "Whip right"],
  ["SLIDE_UP", "Slide up"], ["BLUR", "Blur"], ["CIRCLE_OPEN", "Circle reveal"], ["PIXELATE", "Pixelate"],
  ["DIP_BLACK", "Dip to black"], ["DIP_WHITE", "Dip to white"], ["FLASH", "Flash"],
];
// A small swatch per look so the choice reads before the preview re-renders (approximate, CSS only).
const LOOK_SWATCH = {
  natural: "linear-gradient(135deg,#2a2622,#b89478 55%,#e9dccb)",
  warm: "linear-gradient(135deg,#2a2016,#d49a62 55%,#f3dcb8)",
  cool: "linear-gradient(135deg,#161d27,#8ea3b8 55%,#dbe7f2)",
  vivid: "linear-gradient(135deg,#1b1410,#e2703f 55%,#ffd9a0)",
  cinematic: "linear-gradient(135deg,#0f2226,#c98d5c 60%,#f1d2a8)",
  mono: "linear-gradient(135deg,#161616,#8a8a8a 55%,#ececec)",
  vintage: "linear-gradient(135deg,#2e2820,#b59a74 55%,#e8d9b8)",
};

export function EffectCard({ id, layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const e = findItem(plan, "effect", id);
  if (!e) return null;
  const on = e.enabled !== false;
  const zoomKey = HAS_ZOOM[e.kind];
  const r = itemRange(plan, "effect", e);
  const name = `${EFFECT_TITLE[e.kind] || "Effect"} at ${fmtTcShort(r?.outIn)}`;
  const apply = (op) => { const res = f.apply(op); if (!res.ok) f.toast({ tone: "error", message: res.reason }); };
  return (
    <ItemCard kind="effect" id={id} layout={layout} dim={!on} status={on ? null : { label: "OFF", tone: "dim" }}>
      <Switch label={name} checked={on} onChange={(v) => apply({ type: "effect.toggle", id, enabled: v })} />
      {zoomKey && (
        <RangeField
          label="Zoom"
          min={1.05}
          max={1.4}
          step={0.01}
          value={Number(e[zoomKey]) || 1.1}
          format={(v) => `${Number(v).toFixed(2)}×`}
          disabled={!on}
          onChange={(v) => apply({ type: "effect.adjust", id, zoom: Math.round(v * 100) / 100 })}
        />
      )}
      <CostHint op={{ type: "effect.adjust" }} />
    </ItemCard>
  );
}

export function GraphicCard({ id, layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const g = findItem(plan, "graphic", id);
  if (!g) return null;
  const on = g.enabled !== false;
  const fields = GRAPHIC_FIELDS[g.kind] || [["title", "Title", 60]];
  return (
    <ItemCard kind="graphic" id={id} layout={layout} dim={!on} status={on ? null : { label: "OFF", tone: "dim" }}>
      <Switch label={`${GRAPHIC_TITLE[g.kind] || "Graphic"} on`} checked={on} onChange={(v) => f.apply({ type: "graphic.toggle", id, enabled: v })} />
      {fields.map(([field, label, max]) => (
        <TextField
          key={field}
          label={label}
          value={g.text?.[field] ?? ""}
          maxLength={max}
          disabled={!on}
          onSave={(text) => {
            const r = f.apply({ type: "graphic.editText", id, [field]: text });
            if (r.ok) f.toast({ message: `${GRAPHIC_TITLE[g.kind] || "Graphic"} updated · re-rendering the card` });
            return r;
          }}
        />
      ))}
      <CostHint op={{ type: "graphic.editText" }} />
    </ItemCard>
  );
}

function TransitionRow({ t }) {
  const f = useEditorActions();
  const selectId = useId();
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label htmlFor={selectId} className="label-mono" style={{ color: "var(--color-dark-dim)" }}>TRANSITION AT {fmtTcShort(t.resolved?.outAt ?? t.at?.outAt ?? 0)}</label>
      <select
        id={selectId}
        className="editor-inset"
        value={t.kind}
        onChange={(e) => { const r = f.apply({ type: "transition.set", id: t.id, kind: e.target.value }); if (!r.ok) f.toast({ tone: "error", message: r.reason }); }}
        style={{ minHeight: 44, padding: "10px 12px", colorScheme: "dark", fontFamily: "var(--font-body)", fontSize: 14 }}
      >
        {TRANSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export default function EffectsPanel({ layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  if (!plan) return null;
  const settings = plan.settings || {};
  const apply = (op) => { const r = f.apply(op); if (!r.ok) f.toast({ tone: "error", message: r.reason }); };
  const effects = [...(plan.effects || [])].sort((a, b) => (a.resolved?.outIn ?? 0) - (b.resolved?.outIn ?? 0));
  const graphics = plan.graphics || [];
  const transitions = plan.transitions || [];

  return (
    <div>
      <PanelSection first title="MOTION" aside={<CostHint op={{ type: "settings.set", key: "effects" }} />}>
        <RadioChips label="Intensity" value={settings.effects || "subtle"} options={EFFECTS_OPTIONS} onChange={(v) => apply({ type: "settings.set", key: "effects", value: v })} />
        <Switch label="All effects" description="Zooms and punch-ins on or off" checked={settings.effectsEnabled !== false} onChange={(v) => apply({ type: "settings.set", key: "effectsEnabled", value: v })} />
        <Switch label="Auto jump cuts" description="Punch-in hides the cut" checked={settings.autoJumpCuts !== false} onChange={(v) => apply({ type: "settings.set", key: "autoJumpCuts", value: v })} />
      </PanelSection>

      <PanelSection title={`ZOOMS & PUNCH-INS · ${effects.filter((e) => e.enabled !== false).length}`}>
        {effects.length ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {effects.map((e) => <li key={e.id}><EffectCard id={e.id} layout={layout} /></li>)}
          </ol>
        ) : <p style={{ margin: 0, fontSize: 14, color: "var(--color-dark-dim)" }}>No zooms in this edit.</p>}
      </PanelSection>

      <PanelSection title={`GRAPHICS · ${graphics.filter((g) => g.enabled !== false).length}`}>
        {graphics.length ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {graphics.map((g) => <li key={g.id}><GraphicCard id={g.id} layout={layout} /></li>)}
          </ol>
        ) : <p style={{ margin: 0, fontSize: 14, color: "var(--color-dark-dim)" }}>No titles or cards in this edit.</p>}
      </PanelSection>

      <PanelSection title="TRANSITIONS" aside={<CostHint op={{ type: "settings.set", key: "cutTransition" }} />}>
        <RadioChips
          label="Between cuts"
          variant="tile"
          columns={2}
          value={settings.cutTransition || "auto"}
          options={CUT_TRANSITION_OPTIONS}
          onChange={(v) => apply({ type: "settings.set", key: "cutTransition", value: v })}
        />
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--color-dark-dim)" }}>
          Laid on every cut between kept clips. Auto melts jump cuts inside a sentence and adds a zoom, whip or slide where a new point starts, with a whoosh under it.
        </p>
        {transitions.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            <span className="label-mono" style={{ color: "var(--color-dark-dim)" }}>TOPIC CHANGES · {transitions.filter((t) => t.enabled !== false && t.kind !== "CUT").length}</span>
            {transitions.map((t) => <TransitionRow key={t.id} t={t} />)}
          </div>
        )}
      </PanelSection>

      <PanelSection title="LOOK" aside={<CostHint op={{ type: "settings.set", key: "look" }} />}>
        <RadioChips
          label="Colour look"
          variant="tile"
          columns={2}
          value={settings.look || "natural"}
          options={LOOK_OPTIONS}
          onChange={(v) => apply({ type: "settings.set", key: "look", value: v })}
          renderOption={(o, checked) => (
            <span style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-dark-ink)" }}>
              <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: LOOK_SWATCH[o.value] || LOOK_SWATCH.natural, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)" }} />
              <span>{o.label}</span>
              {checked && <span aria-hidden="true" style={{ color: "var(--color-cy)" }}>✓</span>}
            </span>
          )}
        />
      </PanelSection>
    </div>
  );
}
