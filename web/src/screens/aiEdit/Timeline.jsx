import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useEditor, useEditorActions, selectDirtyRanges } from "../../editState.js";
import { buildPieces, itemRange, outDuration, clamp } from "../../editModel.js";
import { SEGMENT_COLORS, SEGMENT_LABELS, fmtTcShort, fmtDuration, itemHead } from "../../editFormat.js";
import { playerClock } from "../../playerClock.js";

// TIMELINE (UX.md §1d, §2) — the edit on OUTPUT time: A talking-head segments (HOOK magenta, TALKING
// HEAD neutral, EMPHASIS amber, SCREEN blue, CTA lime) with cut joints as REC ticks, B-roll in cyan,
// effects as diamonds and graphics as bars, caption ticks, music (dimmed under speech) with SFX dots.
// Ranges the preview doesn't show yet are hatched magenta — marked, never faked. The playhead moves
// on animation frames through a transform (no React renders). Each track is one Tab stop (a toolbar
// with roving ←/→, Home/End); Enter/Space selects; clicking empty track space seeks.

const CSS = `
.kf-tl{position:relative;min-width:0}
.kf-tl-grid{display:grid;grid-template-columns:40px minmax(0,1fr);column-gap:8px;row-gap:6px;align-items:center}
.kf-tl-label{font-family:var(--font-mono);font-size:9px;letter-spacing:.16em;color:var(--color-dark-dim);text-align:right}
.kf-tl-track{position:relative;height:26px;border-radius:6px;background:rgba(242,237,226,.04);cursor:pointer}
.kf-tl-area{position:relative;grid-column:2;grid-row:1 / span 6}
.kf-tl-item{position:absolute;top:3px;bottom:3px;padding:0;border:0;border-radius:4px;cursor:pointer;min-width:6px;overflow:hidden;font-family:var(--font-mono);font-size:8.5px;letter-spacing:.1em;color:var(--color-ink);text-align:left;white-space:nowrap;text-overflow:ellipsis}
.kf-tl-item[data-sel]{box-shadow:0 0 0 2px var(--color-mag),0 0 0 4px rgba(232,50,168,.35);z-index:3}
.kf-tl-item[data-off]{opacity:.35}
.kf-tl-tick{width:14px;margin-left:-7px;min-width:0;background:transparent}
.kf-tl-tick::after{content:"";position:absolute;left:6px;top:-2px;bottom:-2px;width:2px;background:var(--color-rec);border-radius:1px}
.kf-tl-dia{width:16px;margin-left:-8px;min-width:0;background:transparent;overflow:visible}
.kf-tl-dia::after{content:"";position:absolute;left:3px;top:50%;width:10px;height:10px;margin-top:-5px;transform:rotate(45deg);background:var(--color-am);border-radius:2px}
.kf-tl-dot{width:14px;margin-left:-7px;min-width:0;background:transparent;overflow:visible}
.kf-tl-dot::after{content:"";position:absolute;left:3px;top:50%;width:8px;height:8px;margin-top:-4px;border-radius:50%;background:var(--color-lm)}
.kf-tl-hatch{position:absolute;top:0;bottom:0;pointer-events:none;z-index:2;background:repeating-linear-gradient(135deg,rgba(232,50,168,.42) 0 4px,transparent 4px 9px);border-left:1px solid rgba(232,50,168,.7);border-right:1px solid rgba(232,50,168,.7)}
.kf-tl-head{position:absolute;top:-6px;bottom:-4px;left:0;width:2px;margin-left:-1px;background:var(--color-mag);box-shadow:0 0 10px rgba(232,50,168,.8);pointer-events:none;z-index:4;will-change:transform}
.kf-tl-head::before{content:"";position:absolute;top:0;left:-4px;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid var(--color-mag)}
.kf-tl-ruler{position:relative;height:16px;grid-column:2;font-family:var(--font-mono);font-size:9px;color:var(--color-dark-dim)}
.kf-tl-ruler span{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}
.kf-tl-ruler span::after{content:"";position:absolute;left:50%;top:13px;width:1px;height:4px;background:rgba(242,237,226,.25)}
@media (pointer:coarse){.kf-tl-track{height:32px}}
`;

const TRACKS = [
  { key: "a", label: "A", name: "Talking-head track" },
  { key: "b", label: "B", name: "B-roll track" },
  { key: "fx", label: "FX", name: "Effects and graphics track" },
  { key: "cc", label: "CC", name: "Captions track" },
  { key: "mus", label: "MUS", name: "Music and sound track" },
];

function buildTracks(plan, words) {
  const empty = { a: [], b: [], fx: [], cc: [], mus: [], speech: [] };
  if (!plan) return empty;
  const built = buildPieces(plan, { words });
  const active = new Set(built.activeCutIds);
  const out = { a: [], b: [], fx: [], cc: [], mus: [], speech: [] };
  const push = (track, kind, it, extra) => {
    const r = itemRange(plan, kind, it);
    if (!r) return;
    if (r.collapsed && kind !== "cut") return;
    out[track].push({ kind, id: it.id ?? kind, outIn: r.outIn, outOut: r.outOut, ...extra });
  };
  for (const s of plan.aRoll?.segments || []) {
    push("a", "segment", s, { variant: "block", color: SEGMENT_COLORS[s.type] || "rgba(242,237,226,.28)", label: (SEGMENT_LABELS[s.type] || s.type || "").toString() });
    if (s.resolved && !s.resolved.collapsed) out.speech.push([s.resolved.outIn, s.resolved.outOut]);
  }
  for (const c of plan.cuts || []) if (active.has(c.id)) push("a", "cut", c, { variant: "tick" });
  for (const b of plan.broll || []) push("b", "broll", b, { variant: "block", color: "var(--color-cy)", status: b.status, label: `#${b.ordinal}` });
  for (const e of plan.effects || []) push("fx", "effect", e, { variant: "dia", off: e.enabled === false });
  for (const g of plan.graphics || []) push("fx", "graphic", g, { variant: "block", color: "var(--color-mag)", off: g.enabled === false, thin: true });
  for (const c of plan.captions?.cues || []) push("cc", "caption", c, { variant: "block", color: "rgba(242,237,226,.62)", off: !!c.hidden || plan.captions?.enabled === false, thin: true });
  if (plan.music) push("mus", "music", { ...plan.music, id: "music" }, { variant: "block", color: "var(--color-lm)", off: plan.music.enabled === false, music: true });
  for (const x of plan.sfx || []) push("mus", "sfx", x, { variant: "dot", off: x.enabled === false || plan.settings?.sfxEnabled === false });
  for (const k of ["a", "b", "fx", "cc", "mus"]) out[k].sort((p, q) => p.outIn - q.outIn || (p.variant === "block" ? -1 : 1));
  return out;
}

const pct = (t, dur) => (dur > 0 ? clamp((t / dur) * 100, 0, 100) : 0);

export default function Timeline({ onActivate }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const words = useEditor((s) => s.transcript?.words);
  const selection = useEditor((s) => s.selection);
  const pending = useEditor((s) => s.pendingItemIds);
  const dirty = useEditor(selectDirtyRanges);
  const titleId = useId();
  const [stops, setStops] = useState({});
  const areaRef = useRef(null);
  const headRef = useRef(null);
  const itemEls = useRef(new Map());

  const dur = outDuration(plan);
  const tracks = useMemo(() => buildTracks(plan, words), [plan, words]);

  // Playhead: plan time on every animation frame, straight to the DOM.
  useEffect(() => {
    const area = areaRef.current;
    const head = headRef.current;
    if (!area || !head) return undefined;
    let width = area.clientWidth;
    const draw = (t) => {
      const p = dur > 0 ? clamp(f.toPlanTime(t) / dur, 0, 1) : 0;
      head.style.transform = `translateX(${Math.round(p * width * 10) / 10}px)`;
    };
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { width = area.clientWidth; draw(playerClock.getTime()); }) : null;
    ro?.observe(area);
    draw(playerClock.getTime());
    const off = playerClock.subscribeFrame(draw);
    return () => { off(); ro?.disconnect(); };
  }, [f, dur, plan]);

  const step = dur <= 20 ? 2 : dur <= 60 ? 5 : dur <= 150 ? 10 : 30;
  const ticks = [];
  for (let t = 0; t <= dur + 0.001 && dur > 0; t += step) ticks.push(t);

  const seekAt = (e) => {
    if (e.target !== e.currentTarget || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    f.seek(clamp((e.clientX - r.left) / r.width, 0, 1) * dur);
  };

  const keyOf = (it) => `${it.kind}:${it.id}`;
  const isSel = (it) => !!selection && selection.kind === it.kind && selection.id === it.id;

  const onKey = (e, track, idx) => {
    const list = tracks[track.key];
    let next;
    switch (e.key) {
      case "ArrowRight": next = Math.min(list.length - 1, idx + 1); break;
      case "ArrowLeft": next = Math.max(0, idx - 1); break;
      case "Home": next = 0; break;
      case "End": next = list.length - 1; break;
      default: return;
    }
    e.preventDefault();
    const it = list[next];
    if (!it) return;
    setStops((s) => ({ ...s, [track.key]: keyOf(it) }));
    itemEls.current.get(keyOf(it))?.focus();
  };

  const activate = (it) => {
    const was = isSel(it);
    f.selectItem({ kind: it.kind, id: it.id }, { source: "timeline" });
    onActivate?.({ kind: it.kind, id: it.id }, was);
  };

  return (
    <section className="kf-tl" aria-labelledby={titleId}>
      <style href="kf-timeline-styles" precedence="kf">{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 id={titleId} className="label-mono" style={{ margin: 0, color: "var(--color-dark-dim)", fontWeight: 500 }}>
          TIMELINE <span style={{ color: "var(--color-dark-ink)" }}>· OUTPUT {fmtDuration(dur)}</span>
        </h2>
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 12, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--color-dark-dim)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 9, borderRadius: 2, background: "repeating-linear-gradient(135deg,rgba(232,50,168,.8) 0 3px,transparent 3px 6px)", border: "1px solid rgba(232,50,168,.7)" }} />NOT IN PREVIEW YET</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 2, height: 10, background: "var(--color-rec)" }} />CUT</span>
        </span>
      </div>

      <div role="group" aria-labelledby={titleId} data-kf-zone="timeline" className="kf-tl-grid">
        <span aria-hidden="true" />
        <div className="kf-tl-ruler" aria-hidden="true" onClick={seekAt}>
          {ticks.map((t) => <span key={t} style={{ left: `${pct(t, dur)}%` }}>{fmtTcShort(t).replace(/^00:/, "0:")}</span>)}
        </div>

        {TRACKS.map((track, row) => {
          const list = tracks[track.key];
          const selIdx = list.findIndex(isSel);
          const stopIdx = selIdx >= 0 ? selIdx : Math.max(0, list.findIndex((it) => keyOf(it) === stops[track.key]));
          return (
            <div key={track.key} style={{ display: "contents" }}>
              <span className="kf-tl-label" aria-hidden="true" style={{ gridRow: row + 2, gridColumn: 1 }}>{track.label}</span>
              <div
                role="toolbar"
                aria-label={track.name}
                aria-orientation="horizontal"
                className="kf-tl-track"
                onClick={seekAt}
                style={{ gridRow: row + 2, gridColumn: 2 }}
              >
                {track.key === "mus" && tracks.speech.map(([a, b], k) => (
                  <span key={`sp${k}`} aria-hidden="true" style={{ position: "absolute", top: 3, bottom: 3, left: `${pct(a, dur)}%`, width: `${pct(b - a, dur)}%`, background: "rgba(13,11,7,.5)", borderRadius: 3, zIndex: 1, pointerEvents: "none" }} />
                ))}
                {list.map((it, idx) => {
                  const sel = isSel(it);
                  const isPending = pending.includes(it.id);
                  const head = itemHead({ kind: it.kind, id: it.id }, plan) || it.kind;
                  const status = it.status === "removed" ? ", removed" : it.status === "missing" ? ", no clip found" : it.off ? ", off" : "";
                  const common = {
                    ref: (el) => { if (el) itemEls.current.set(keyOf(it), el); else itemEls.current.delete(keyOf(it)); },
                    type: "button",
                    tabIndex: idx === stopIdx ? 0 : -1,
                    "aria-label": `${head}${status}${isPending ? ", not in preview yet" : ""}`,
                    "aria-current": sel ? "true" : undefined,
                    "data-sel": sel || undefined,
                    "data-off": it.off || it.status === "removed" || undefined,
                    title: head,
                    onClick: (e) => { e.stopPropagation(); activate(it); },
                    onKeyDown: (e) => onKey(e, track, idx),
                    onFocus: () => { if (stops[track.key] !== keyOf(it)) setStops((s) => ({ ...s, [track.key]: keyOf(it) })); },
                  };
                  if (it.variant === "tick") return <button key={keyOf(it)} {...common} className="kf-tl-item kf-tl-tick" style={{ left: `${pct(it.outIn, dur)}%`, zIndex: 2 }} />;
                  if (it.variant === "dia") return <button key={keyOf(it)} {...common} className="kf-tl-item kf-tl-dia" style={{ left: `${pct(it.outIn, dur)}%`, zIndex: 2 }} />;
                  if (it.variant === "dot") return <button key={keyOf(it)} {...common} className="kf-tl-item kf-tl-dot" style={{ left: `${pct(it.outIn, dur)}%`, zIndex: 2 }} />;
                  const removed = it.status === "removed";
                  const missing = it.status === "missing";
                  return (
                    <button
                      key={keyOf(it)}
                      {...common}
                      className="kf-tl-item"
                      style={{
                        left: `${pct(it.outIn, dur)}%`,
                        width: `max(6px, ${pct(it.outOut - it.outIn, dur)}%)`,
                        top: it.thin ? 7 : 3, bottom: it.thin ? 7 : 3,
                        padding: it.thin ? 0 : "0 5px",
                        background: removed || missing
                          ? `repeating-linear-gradient(135deg, ${missing ? "rgba(255,176,58,.35)" : "rgba(35,200,224,.22)"} 0 3px, transparent 3px 6px)`
                          : it.color,
                        border: removed || missing ? `1px dashed ${missing ? "var(--color-am)" : "var(--color-cy)"}` : 0,
                        color: removed || missing ? "var(--color-dark-ink)" : it.color === SEGMENT_COLORS.TALKING_HEAD ? "var(--color-dark-ink)" : "var(--color-ink)",
                        zIndex: it.music ? 0 : 2,
                        opacity: it.music && !it.off ? 0.55 : undefined,
                      }}
                    >
                      <span aria-hidden="true">{missing ? "⚠" : it.label || ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div ref={areaRef} className="kf-tl-area" aria-hidden="true" style={{ gridRow: "2 / span 5", pointerEvents: "none", alignSelf: "stretch" }}>
          {dirty.map(([a, b], k) => (
            <span key={k} className="kf-tl-hatch" style={{ left: `${pct(a, dur)}%`, width: `max(3px, ${pct(b - a, dur)}%)` }} />
          ))}
          <span ref={headRef} className="kf-tl-head" />
        </div>
      </div>
    </section>
  );
}
