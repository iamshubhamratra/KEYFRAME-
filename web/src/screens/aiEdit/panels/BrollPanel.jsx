import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { useEditor, useEditorActions } from "../../../editState.js";
import { findItem, planTimeMap, projectWords } from "../../../editModel.js";
import { BROLL_OPTIONS, BROLL_LAYOUT_OPTIONS, fmtTcShort } from "../../../editFormat.js";
import { LOGO_CORNERS } from "../../../brand.js";
import RadioChips from "../../../components/RadioChips.jsx";
import Switch from "../../../components/Switch.jsx";
import ItemCard, { ActionButton, PanelSection, CostHint } from "../ItemCard.jsx";

// B-ROLL (UX.md §1d panel 3) — the amount (a re-plan that keeps everything you touched), then each
// slot as a card: its clip (3-second preview on hover/focus), the line that asked for it, what was
// searched and why this clip won, Replace (saved suggestions or a stock search), Regenerate with
// editable terms, Remove with Undo, FULL / SPLIT / PIP layout and Lock. A slot the search couldn't
// fill says so and offers a stock search or removing the slot.

const orientationOf = (w, h) => (!w || !h ? null : w > h * 1.05 ? "LANDSCAPE" : h > w * 1.05 ? "PORTRAIT" : "SQUARE");
function fitsAspect(w, h, aspect) {
  if (!w || !h) return null;
  const r = w / h;
  if (aspect === "9:16") return r < 0.8;
  if (aspect === "16:9") return r > 1.3;
  return r > 0.85 && r < 1.18;
}

function BrollThumb({ item, aspect }) {
  const f = useEditorActions();
  const chosen = item.chosen;
  const assetId = chosen?.assetId || null;
  const thumb = useSyncExternalStore(f.media.subscribe, () => (assetId ? f.media.get("broll-thumb", assetId) : null));
  const preview = useSyncExternalStore(f.media.subscribe, () => (assetId ? f.media.get("broll-preview", assetId) : null));
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (assetId) { f.media.request("broll-thumb", assetId); f.media.request("broll-preview", assetId); } }, [f, assetId]);
  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => setPlaying(false), 3000);
    return () => clearTimeout(t);
  }, [playing]);

  const fit = chosen ? fitsAspect(chosen.width, chosen.height, aspect) : null;
  const box = {
    position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", display: "grid", placeItems: "center",
    background: chosen ? "var(--color-dark-2)" : "repeating-linear-gradient(135deg, rgba(255,176,58,.16) 0 6px, transparent 6px 12px)",
    border: chosen ? "1px solid var(--color-dark-line)" : "1px dashed rgba(255,176,58,.5)",
  };
  const inner = (
    <>
      {thumb && <img src={thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      {playing && preview && <video src={preview} autoPlay muted playsInline aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      {!chosen && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-am)" }}>⚠ NO CLIP</span>}
      {chosen && (
        <span style={{ position: "absolute", left: 6, bottom: 6, padding: "2px 6px", borderRadius: 6, background: "rgba(13,11,7,.78)", fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.1em", color: fit ? "var(--color-lm)" : "var(--color-am)" }}>
          {fit ? `FITS ${aspect}` : `CROPPED TO ${aspect}`}
        </span>
      )}
    </>
  );
  if (!preview) return <div aria-hidden="true" style={box}>{inner}</div>;
  return (
    <button
      type="button"
      aria-label={`Preview B-roll #${item.ordinal} for 3 seconds`}
      onMouseEnter={() => setPlaying(true)}
      onMouseLeave={() => setPlaying(false)}
      onFocus={() => setPlaying(true)}
      onBlur={() => setPlaying(false)}
      onClick={() => setPlaying(true)}
      style={{ ...box, padding: 0, cursor: "pointer" }}
    >
      {inner}
    </button>
  );
}

export function BrollCard({ id, layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const transcript = useEditor((s) => s.transcript);
  const entries = useEditor((s) => s.entries);
  const regenId = useId();
  const [regenOpen, setRegenOpen] = useState(false);
  const [query, setQuery] = useState(null);
  const [regenError, setRegenError] = useState(null);
  const item = findItem(plan, "broll", id);
  if (!item) return null;

  const n = item.ordinal;
  const aspect = plan.output?.aspect || "9:16";
  const removed = item.status === "removed";
  const missing = !removed && (item.status === "missing" || (!item.chosen && item.status !== "pending"));
  const finding = item.status === "pending";
  const searching = entries.some((e) => e.targets.includes(id) && e.ops.some((op) => op.type === "broll.regenerate" || op.type === "broll.replace"));
  const defaultQuery = item.queries?.[0]?.text || "";
  const q = query ?? defaultQuery;
  const sentence = transcript?.sentences?.find((s) => s.id === item.sentenceId);
  const chosen = item.chosen;

  const status = removed ? { label: "REMOVED", tone: "dim" }
    : searching ? { label: "SEARCHING…", tone: "info", live: true }
      : finding ? { label: "FINDING A CLIP…", tone: "info", live: true }
        : missing ? { label: "⚠ NO MATCH", tone: "warn" } : null;

  const openReplace = (tab) => f.openDialog("brollReplace", { id, tab });
  const submitRegen = (e) => {
    e.preventDefault();
    const trimmed = q.trim();
    const op = { type: "broll.regenerate", id, ...(trimmed && trimmed !== defaultQuery ? { query: trimmed } : {}) };
    const r = f.apply(op);
    if (!r.ok) { setRegenError(r.reason); return; }
    setRegenError(null);
    setRegenOpen(false);
    f.toast({ message: `Finding a new clip for B-roll #${n}…` });
  };
  const setLayout = (layoutValue, corner) => {
    const r = f.apply({ type: "broll.setLayout", id, layout: layoutValue, ...(layoutValue === "PIP" ? { corner: corner || item.layoutParams?.corner || "br" } : {}) });
    if (!r.ok) f.toast({ tone: "error", message: r.reason });
  };

  if (removed) {
    return (
      <ItemCard kind="broll" id={id} layout={layout} status={status} dim showProvenance={false}
        actions={<ActionButton tone="cy" onClick={() => f.apply({ type: "broll.restore", id })} cost={{ type: "broll.restore" }}>Restore</ActionButton>}
      />
    );
  }

  return (
    <ItemCard
      kind="broll"
      id={id}
      layout={layout}
      status={status}
      actions={missing ? (
        <>
          <ActionButton tone="cy" haspopup="dialog" onClick={() => openReplace("search")} cost="STOCK SEARCH · NO AI">Search stock</ActionButton>
          <ActionButton tone="danger" onClick={() => f.removeItem("broll", id)} keyshortcuts="Delete">Remove slot</ActionButton>
        </>
      ) : (
        <>
          <ActionButton haspopup="dialog" onClick={() => openReplace("suggestions")} cost={{ type: "broll.regenerate" }}>Replace</ActionButton>
          <ActionButton expanded={regenOpen} controls={regenId} onClick={() => setRegenOpen((o) => !o)} cost={{ type: "broll.regenerate", ...(q.trim() !== defaultQuery ? { query: q } : {}) }}>Regenerate</ActionButton>
          <ActionButton tone="danger" onClick={() => f.removeItem("broll", id)} keyshortcuts="Delete" cost={{ type: "broll.remove" }}>Remove</ActionButton>
        </>
      )}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(96px, 132px) minmax(0,1fr)", gap: 12, alignItems: "start" }}>
        <BrollThumb item={item} aspect={aspect} />
        <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
          {sentence && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, fontStyle: "italic", color: "var(--color-dark-ink)" }}>“{sentence.text}”</p>}
          {chosen && (
            <span className="label-mono" style={{ color: "var(--color-dark-dim)", overflowWrap: "anywhere" }}>
              {String(chosen.provider || "stock").toUpperCase()} · {orientationOf(chosen.width, chosen.height) || "CLIP"}{chosen.durationSec ? ` · ${Math.round(chosen.durationSec)}S` : ""}
            </span>
          )}
          {chosen?.attribution && <span style={{ fontSize: 12, color: "var(--color-dark-dim)" }}>{chosen.attribution}</span>}
        </div>
      </div>

      {regenOpen && !missing && (
        <form id={regenId} onSubmit={submitRegen} style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, border: "1px solid var(--color-dark-line)", background: "rgba(242,237,226,.03)" }}>
          <label htmlFor={`${regenId}-q`} className="label-mono" style={{ color: "var(--color-dark-dim)" }}>SEARCH TERMS · EDIT OR KEEP</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input
              id={`${regenId}-q`}
              className="editor-inset"
              value={q}
              maxLength={80}
              onChange={(e) => { setQuery(e.target.value); setRegenError(null); }}
              aria-invalid={regenError ? true : undefined}
              aria-describedby={regenError ? `${regenId}-err` : undefined}
              style={{ flex: "1 1 180px", minWidth: 0, minHeight: 44, padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 14 }}
            />
            <button type="submit" className="btn-ink on-dark" style={{ minHeight: 44 }}>Find a new clip</button>
          </div>
          {regenError && <p id={`${regenId}-err`} role="alert" style={{ margin: 0, fontSize: 13, color: "#ff6a3c" }}>{regenError}</p>}
        </form>
      )}

      {!missing && (
        <>
          <RadioChips
            label="Layout"
            value={item.layout}
            options={BROLL_LAYOUT_OPTIONS.map((o) => (o.value === "SPLIT" && aspect === "1:1" ? { ...o, disabled: true, title: "Split screen needs 9:16 or 16:9" } : o))}
            onChange={(v) => setLayout(v)}
          />
          {item.layout === "PIP" && (
            <RadioChips label="Picture-in-picture corner" value={item.layoutParams?.corner || "br"} options={LOGO_CORNERS} onChange={(v) => setLayout("PIP", v)} />
          )}
        </>
      )}
      <Switch label="Lock" description="AI re-plans keep this slot as it is" checked={!!item.locked} onChange={(v) => f.apply({ type: "broll.setLocked", id, locked: v })} />
    </ItemCard>
  );
}

function AddBroll() {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const transcript = useEditor((s) => s.transcript);
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [sentenceId, setSentenceId] = useState("");
  const [error, setError] = useState(null);

  const options = useMemo(() => {
    const sentences = transcript?.sentences || [];
    const words = transcript?.words || [];
    if (!plan || !sentences.length) return [];
    const projected = projectWords(plan, words);
    const cutByIndex = new Map(projected.map((p) => [p.i, p.cut]));
    const taken = new Set((plan.broll || []).filter((b) => b.status !== "removed").map((b) => b.sentenceId));
    const tm = planTimeMap(plan);
    return sentences
      .filter((s) => !taken.has(s.id) && !s.faceRequired)
      .filter((s) => { for (let i = s.w0; i <= s.w1; i++) if (cutByIndex.get(i) === false) return true; return false; })
      .map((s) => ({ id: s.id, label: `${fmtTcShort(tm.srcToOutStart(s.start))} — “${s.text.length > 64 ? `${s.text.slice(0, 62)}…` : s.text}”` }));
  }, [plan, transcript]);

  const add = () => {
    if (!sentenceId) { setError("Pick a line for the B-roll."); return; }
    const r = f.apply({ type: "broll.add", sentenceId, layout: "FULL" });
    if (!r.ok) { setError(r.reason); return; }
    setError(null);
    setOpen(false);
    setSentenceId("");
    f.toast({ message: "Adding B-roll · searching stock for that line" });
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div><ActionButton tone="cy" expanded={open} controls={`${uid}-add`} onClick={() => setOpen((o) => !o)}>+ Add B-roll</ActionButton></div>
      {open && (
        <div id={`${uid}-add`} style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, border: "1px solid var(--color-dark-line)" }}>
          <label htmlFor={`${uid}-line`} className="label-mono" style={{ color: "var(--color-dark-dim)" }}>PICK A LINE</label>
          {options.length ? (
            <select id={`${uid}-line`} className="editor-inset" value={sentenceId} onChange={(e) => { setSentenceId(e.target.value); setError(null); }} style={{ minHeight: 44, padding: "10px 12px", width: "100%", colorScheme: "dark", fontFamily: "var(--font-body)", fontSize: 14 }}>
              <option value="">Choose a line…</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-dark-dim)" }}>Every line that can take B-roll already has some — or the speaker needs to stay on screen.</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <button type="button" className="btn-ink on-dark" onClick={add} disabled={!options.length} style={{ minHeight: 44 }}>Add B-roll</button>
            <CostHint op={{ type: "broll.add" }} />
          </div>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "#ff6a3c" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function BrollPanel({ layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const hintId = useId();
  const intensity = plan?.settings?.brollIntensity || "medium";
  const list = [...(plan?.broll || [])].sort((a, b) => a.ordinal - b.ordinal);
  const live = list.filter((b) => b.status !== "removed").length;
  const change = (v) => {
    f.noteReplan(intensity, v);
    const r = f.apply({ type: "settings.set", key: "brollIntensity", value: v });
    if (!r.ok) f.toast({ tone: "error", message: r.reason });
  };
  return (
    <div>
      <PanelSection first title="AMOUNT" aside={<CostHint op={{ type: "settings.set", key: "brollIntensity", value: intensity }} />}>
        <RadioChips label="B-roll amount" hideLabel variant="tile" columns={3} value={intensity} options={BROLL_OPTIONS} onChange={change} describedBy={hintId} />
        <p id={hintId} style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--color-dark-dim)" }}>Changes AI picks you haven't touched. Locked and edited slots stay.</p>
      </PanelSection>
      <PanelSection title={`SLOTS · ${live}`}>
        {list.length ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {list.map((b) => <li key={b.id}><BrollCard id={b.id} layout={layout} /></li>)}
          </ol>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: "var(--color-dark-dim)" }}>No B-roll in this edit yet.</p>
        )}
        <AddBroll />
      </PanelSection>
    </div>
  );
}
