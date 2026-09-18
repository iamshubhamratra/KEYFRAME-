import { useEffect, useId, useRef, useState } from "react";
import { useEditor, useEditorActions } from "../../../editState.js";
import { findItem, gainToDb, outDuration } from "../../../editModel.js";
import { fmtDuration, fmtTcShort, COST_HINT_COPY } from "../../../editFormat.js";
import Switch from "../../../components/Switch.jsx";
import ItemCard, { ActionButton, PanelSection, RangeField, CostHint } from "../ItemCard.jsx";

// MUSIC & SFX (UX.md §1d panel 5) — the track (title, mood, source, where it plays), volume −30…0 dB,
// ducking under speech with its depth, Change (stored candidates with a 10-second listen, mood
// chips, a search) and Remove; then each sound effect with its switch and volume, and Mute all.
// Every change here re-mixes audio only — the picture doesn't re-render.

const MOODS = ["upbeat", "calm", "focused", "cinematic", "playful", "energetic"];
const SOURCES = { pixabay_bridge: "PIXABAY", synth: "KEYFRAME", user: "YOURS" };
const db = (v) => `${Math.round(v) > 0 ? "+" : Math.round(v) < 0 ? "−" : ""}${Math.abs(Math.round(v))} dB`;

function MusicChanger({ id }) {
  const f = useEditorActions();
  const music = useEditor((s) => s.plan?.music);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(null);
  const [listening, setListening] = useState(null);
  const audioRef = useRef(null);
  const qId = useId();

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const apply = (op, message) => {
    const r = f.apply(op);
    if (!r.ok) { setError(r.reason); return; }
    setError(null);
    if (message) f.toast({ message });
  };
  const listen = (c) => {
    audioRef.current?.pause();
    if (listening === c.assetId) { setListening(null); return; }
    const a = new Audio(c.previewUrl);
    audioRef.current = a;
    a.play().then(() => {
      setListening(c.assetId);
      setTimeout(() => { a.pause(); setListening((cur) => (cur === c.assetId ? null : cur)); }, 10000);
    }, () => setListening(null));
  };

  const candidates = music?.candidates || [];
  return (
    <div id={id} style={{ display: "grid", gap: 12, padding: 12, borderRadius: 12, border: "1px solid var(--color-dark-line)", background: "rgba(242,237,226,.03)" }}>
      {candidates.length > 0 && (
        <div>
          <div className="label-mono" style={{ marginBottom: 6, color: "var(--color-dark-dim)" }}>OTHER TRACKS WE FOUND · <span style={{ color: "var(--color-dark-ink)" }}>{COST_HINT_COPY.free}</span></div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {candidates.map((c) => (
              <li key={c.assetId} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "4px 0", borderBottom: "1px solid var(--color-dark-line)" }}>
                <span style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, color: "var(--color-dark-ink)" }}>{c.title || "Untitled track"}</span>
                  <span className="label-mono" style={{ color: "var(--color-dark-dim)" }}>{String(c.mood || "").toUpperCase()}{c.durationSec ? ` · ${fmtDuration(c.durationSec)}` : ""} · {SOURCES[c.provider] || String(c.provider || "").toUpperCase()}</span>
                </span>
                {c.previewUrl && (
                  <ActionButton pressed={listening === c.assetId} onClick={() => listen(c)} ariaLabel={`${listening === c.assetId ? "Stop" : "Listen to"} ${c.title || "track"} for 10 seconds`}>
                    {listening === c.assetId ? "■ Stop" : "▶ 10 s"}
                  </ActionButton>
                )}
                <ActionButton tone="cy" onClick={() => apply({ type: "music.change", candidateId: c.assetId }, `Music changed to “${c.title || "new track"}”`)} ariaLabel={`Use ${c.title || "this track"}`}>Use</ActionButton>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="label-mono" style={{ marginBottom: 6, color: "var(--color-dark-dim)" }}>FIND BY MOOD · <span style={{ color: "var(--color-dark-ink)" }}>{COST_HINT_COPY.fetch}</span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MOODS.map((m) => (
            <ActionButton key={m} pressed={music?.track?.mood === m} onClick={() => apply({ type: "music.change", mood: m }, `Finding ${m} music…`)}>{m}</ActionButton>
          ))}
        </div>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); const q = query.trim(); if (!q) { setError("Describe the music you want."); return; } apply({ type: "music.change", query: q }, `Finding “${q}”…`); }}
        style={{ display: "grid", gap: 6 }}
      >
        <label htmlFor={qId} className="label-mono" style={{ color: "var(--color-dark-dim)" }}>OR SEARCH</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <input id={qId} className="editor-inset" value={query} maxLength={40} placeholder="e.g. warm acoustic" onChange={(e) => setQuery(e.target.value)} style={{ flex: "1 1 180px", minWidth: 0, minHeight: 44, padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 14 }} />
          <button type="submit" className="btn-ink on-dark" style={{ minHeight: 44 }}>Find music</button>
        </div>
      </form>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "#ff6a3c" }}>{error}</p>}
    </div>
  );
}

export function MusicCard({ layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const changeId = useId();
  const [changeOpen, setChangeOpen] = useState(false);
  const m = plan?.music;
  const apply = (op) => { const r = f.apply(op); if (!r.ok) f.toast({ tone: "error", message: r.reason }); };

  if (!m) {
    return (
      <div style={{ padding: 16, borderRadius: 14, border: "1px dashed rgba(242,237,226,.25)", display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 14, color: "var(--color-dark-ink)" }}>No music in this edit.</p>
        <MusicChanger id={changeId} />
      </div>
    );
  }
  const on = m.enabled !== false;
  const dur = outDuration(plan);
  return (
    <ItemCard
      kind="music"
      id="music"
      layout={layout}
      dim={!on}
      status={on ? null : { label: "REMOVED", tone: "dim" }}
      actions={on ? (
        <>
          <ActionButton expanded={changeOpen} controls={changeId} onClick={() => setChangeOpen((o) => !o)}>Change</ActionButton>
          <ActionButton tone="danger" onClick={() => f.removeItem("music", "music")} cost={{ type: "music.remove" }}>Remove</ActionButton>
        </>
      ) : (
        <ActionButton tone="cy" onClick={() => apply({ type: "music.restore" })} cost={{ type: "music.restore" }}>Restore</ActionButton>
      )}
    >
      <div>
        <p style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--color-dark-ink)" }}>{m.track?.title || "Music bed"}</p>
        <p className="label-mono" style={{ margin: "4px 0 0", color: "var(--color-dark-dim)" }}>
          {[m.track?.mood && String(m.track.mood).toUpperCase(), SOURCES[m.track?.provider] || (m.track?.provider ? String(m.track.provider).toUpperCase() : null), `PLAYS ${fmtTcShort(0)}–${fmtTcShort(dur)}`].filter(Boolean).join(" · ")}
        </p>
      </div>
      {on && (
        <>
          <RangeField label="Music volume" min={-30} max={0} step={1} value={gainToDb(m.volume ?? 0.1)} format={db} onChange={(v) => apply({ type: "music.setVolume", volumeDb: v })} />
          <Switch label="Duck under speech" description="Music dips while you talk" checked={!!m.duck?.enabled} onChange={(v) => apply({ type: "music.setDucking", enabled: v, depthDb: m.duck?.depthDb ?? -9 })} />
          {m.duck?.enabled && (
            <RangeField label="Duck depth" min={-24} max={-3} step={1} value={m.duck?.depthDb ?? -9} format={db} onChange={(v) => apply({ type: "music.setDucking", enabled: true, depthDb: v })} />
          )}
          <CostHint op={{ type: "music.setVolume" }} />
          {changeOpen && <MusicChanger id={changeId} />}
        </>
      )}
    </ItemCard>
  );
}

export function SfxCard({ id, layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const x = findItem(plan, "sfx", id);
  if (!x) return null;
  const muted = plan.settings?.sfxEnabled === false;
  const on = x.enabled !== false;
  const cue = String(x.cue || "sound");
  const name = `${cue.charAt(0).toUpperCase()}${cue.slice(1)} at ${fmtTcShort(x.resolved?.outAt)}`;
  const apply = (op) => { const r = f.apply(op); if (!r.ok) f.toast({ tone: "error", message: r.reason }); };
  return (
    <ItemCard kind="sfx" id={id} layout={layout} dim={!on || muted} status={muted ? { label: "MUTED", tone: "dim" } : on ? null : { label: "OFF", tone: "dim" }}>
      <Switch label={name} checked={on} disabled={muted} onChange={(v) => apply({ type: "sfx.toggle", id, enabled: v })} />
      <RangeField label="Volume" min={-30} max={6} step={1} value={gainToDb(x.volume ?? 0.25)} format={db} disabled={!on || muted} onChange={(v) => apply({ type: "sfx.setVolume", id, volumeDb: v })} />
    </ItemCard>
  );
}

export default function AudioPanel({ layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  if (!plan) return null;
  const sfx = plan.sfx || [];
  const muted = plan.settings?.sfxEnabled === false;
  return (
    <div>
      <PanelSection first title="MUSIC" aside={<CostHint text="AUDIO ONLY · NO RE-RENDER OF PICTURE" />}>
        <MusicCard layout={layout} />
      </PanelSection>
      <PanelSection title={`SOUND EFFECTS · ${sfx.length}`}>
        <Switch label="Mute all SFX" checked={muted} onChange={(v) => { const r = f.apply({ type: "sfx.muteAll", muted: v }); if (!r.ok) f.toast({ tone: "error", message: r.reason }); }} />
        {sfx.length ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {sfx.map((x) => <li key={x.id}><SfxCard id={x.id} layout={layout} /></li>)}
          </ol>
        ) : <p style={{ margin: 0, fontSize: 14, color: "var(--color-dark-dim)" }}>No sound effects in this edit.</p>}
      </PanelSection>
    </div>
  );
}
