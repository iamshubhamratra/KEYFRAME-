import { useEffect, useRef } from "react";
import { useEditor, useEditorActions, selectDirtyRanges } from "../../editState.js";
import { playerClock, usePlayerState, usePlayerTime } from "../../playerClock.js";
import { outDuration, clamp } from "../../editModel.js";
import { fmtTc, fmtTcShort, SEGMENT_COLORS } from "../../editFormat.js";
import { ariaKeyshortcuts } from "../../shortcuts.js";

// PLAYER CONTROLS (UX.md §1d, §4.8) — the transport in the fixed bottom bar: play/pause, the
// timecode, THE seek slider (role=slider; ←/→ ±1 s, Shift ±5 s, PageUp/Down ±10 s, Home/End) drawn
// as an overview of the edit (segment bands, dirty hatching, B-roll ticks), mute, full screen and
// "Compare original". Time shown and sought is the plan's output time; the provider maps it onto
// whatever the player is showing. The fill and thumb move per animation frame without renders;
// the slider's aria-valuenow updates 4×/s.

const CSS = `
.kf-pc{display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 auto}
.kf-pc-btn{width:44px;height:44px;flex-shrink:0;display:grid;place-items:center;border-radius:999px;border:1px solid transparent;background:transparent;color:var(--color-dark-ink);cursor:pointer;transition:background .2s ease,border-color .2s ease}
.kf-pc-btn:hover{background:rgba(242,237,226,.08)}
.kf-pc-btn[aria-pressed=true]{border-color:var(--color-cy);color:var(--color-cy)}
.kf-pc-btn:disabled{opacity:.4;cursor:not-allowed}
.kf-pc-play{background:var(--color-dark-ink);color:var(--color-ink)}
.kf-pc-play:hover{background:#fff}
.kf-pc-time{font-family:var(--font-mono);font-size:12px;letter-spacing:.04em;color:var(--color-dark-ink);font-variant-numeric:tabular-nums;white-space:nowrap;padding:0 6px}
.kf-pc-time b{color:var(--color-dark-dim);font-weight:400}
.kf-pc-rail{position:relative;flex:1 1 160px;min-width:120px;height:44px;cursor:pointer;touch-action:none;border-radius:8px}
.kf-pc-rail-in{position:absolute;left:0;right:0;top:50%;height:10px;margin-top:-5px;border-radius:999px;background:rgba(242,237,226,.08);overflow:hidden}
.kf-pc-fill{position:absolute;inset:0;transform-origin:left center;background:linear-gradient(90deg,rgba(232,50,168,.55),rgba(255,176,58,.55));will-change:transform}
.kf-pc-thumb{position:absolute;top:50%;left:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--color-dark-ink);box-shadow:0 0 0 3px var(--color-mag),0 2px 8px rgba(0,0,0,.6);will-change:transform;pointer-events:none}
.kf-pc-compare{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;width:auto;padding:0 12px;border-color:rgba(242,237,226,.22)}
@media (max-width:1100px){.kf-pc-compare .kf-pc-compare-long{display:none}.kf-pc-compare{width:44px;padding:0}}
@media (max-width:859px){
  .kf-pc{flex-wrap:wrap;row-gap:0}
  .kf-pc-rail{order:-1;flex:1 1 100%;height:44px}
  .kf-pc-spacer{flex:1}
  .kf-pc-compare .kf-pc-compare-long{display:none}
}
`;

const Icon = {
  play: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>,
  pause: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" /><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" /></svg>,
  sound: <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 7h3l4-3.5v11L6 11H3z" fill="currentColor" /><path d="M12.5 6.2a4 4 0 0 1 0 5.6M14.5 4.2a7 7 0 0 1 0 9.6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg>,
  muted: <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 7h3l4-3.5v11L6 11H3z" fill="currentColor" /><path d="M12.5 7l4 4m0-4l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  full: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>,
  exitFull: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>,
  compare: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" /><path d="M8 1.5v13" stroke="currentColor" strokeWidth="1.4" /><rect x="8" y="3" width="6.5" height="10" rx="0" fill="currentColor" opacity=".35" /></svg>,
};

export default function PlayerControls({ hasMedia = false, compare = false, canCompare = false, onToggleCompare, fullscreen = false, onToggleFullscreen }) {
  const f = useEditorActions();
  const ps = usePlayerState();
  const t = usePlayerTime(250);
  const plan = useEditor((s) => s.plan);
  const outline = useEditor((s) => s.outline);
  const dirty = useEditor(selectDirtyRanges);
  const railRef = useRef(null);
  const fillRef = useRef(null);
  const thumbRef = useRef(null);
  const scrubbing = useRef(false);

  const dur = outDuration(plan);
  const planT = clamp(f.toPlanTime(t), 0, dur || 0);
  const pct = (x) => (dur > 0 ? clamp((x / dur) * 100, 0, 100) : 0);

  useEffect(() => {
    const rail = railRef.current;
    const fill = fillRef.current;
    const thumb = thumbRef.current;
    if (!rail || !fill || !thumb) return undefined;
    let width = rail.clientWidth;
    const draw = (time) => {
      const p = dur > 0 ? clamp(f.toPlanTime(time) / dur, 0, 1) : 0;
      fill.style.transform = `scaleX(${p})`;
      thumb.style.transform = `translateX(${Math.round(p * width * 10) / 10}px)`;
    };
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { width = rail.clientWidth; draw(playerClock.getTime()); }) : null;
    ro?.observe(rail);
    draw(playerClock.getTime());
    const off = playerClock.subscribeFrame(draw);
    return () => { off(); ro?.disconnect(); };
  }, [f, dur, plan]);

  const seekFromPointer = (e) => {
    const rail = railRef.current;
    if (!rail || !dur) return;
    const r = rail.getBoundingClientRect();
    f.seek(clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1) * dur);
  };

  const onKeyDown = (e) => {
    let d;
    switch (e.key) {
      case "ArrowLeft": case "ArrowDown": d = e.shiftKey ? -5 : -1; break;
      case "ArrowRight": case "ArrowUp": d = e.shiftKey ? 5 : 1; break;
      case "PageDown": d = -10; break;
      case "PageUp": d = 10; break;
      case "Home": e.preventDefault(); f.seek(0); return;
      case "End": e.preventDefault(); f.seek(Math.max(0, dur - 0.05)); return;
      default: return;
    }
    e.preventDefault();
    f.seek(f.planNow() + d);
  };

  const brollTicks = outline?.tracks?.broll || [];

  return (
    <div className="kf-pc" data-kf-zone="player">
      <style href="kf-player-controls-styles" precedence="kf">{CSS}</style>
      <button
        type="button"
        className="kf-pc-btn kf-pc-play"
        onClick={() => playerClock.toggle()}
        disabled={!hasMedia}
        aria-label={ps.playing ? "Pause" : "Play"}
        aria-keyshortcuts={ariaKeyshortcuts("togglePlay")}
        title={hasMedia ? undefined : "No preview to play yet"}
      >
        {ps.playing ? Icon.pause : Icon.play}
      </button>
      <span className="kf-pc-time">{fmtTc(planT)} <b>/ {fmtTc(dur)}</b></span>

      <div
        ref={railRef}
        className="kf-pc-rail"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur * 10) / 10}
        aria-valuenow={Math.round(planT * 10) / 10}
        aria-valuetext={`${fmtTcShort(planT)} of ${fmtTcShort(dur)}`}
        aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Home End"
        data-kf-zone="slider"
        onKeyDown={onKeyDown}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); scrubbing.current = true; seekFromPointer(e); }}
        onPointerMove={(e) => { if (scrubbing.current) seekFromPointer(e); }}
        onPointerUp={() => { scrubbing.current = false; }}
        onPointerCancel={() => { scrubbing.current = false; }}
      >
        <div className="kf-pc-rail-in" aria-hidden="true">
          {(outline?.aRoll || []).map((s) => (
            <span key={s.id} style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(s.outIn)}%`, width: `${pct(s.outOut - s.outIn)}%`, background: SEGMENT_COLORS[s.type], opacity: 0.22 }} />
          ))}
          <span ref={fillRef} className="kf-pc-fill" style={{ transform: `scaleX(${dur ? planT / dur : 0})` }} />
          {dirty.map(([a, b], k) => (
            <span key={k} style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(a)}%`, width: `max(2px, ${pct(b - a)}%)`, background: "repeating-linear-gradient(135deg,rgba(232,50,168,.75) 0 3px,transparent 3px 6px)" }} />
          ))}
          {brollTicks.filter((b) => b.status !== "removed").map((b) => (
            <span key={b.id} style={{ position: "absolute", bottom: 0, height: 3, left: `${pct(b.outIn)}%`, width: `max(2px, ${pct(b.outOut - b.outIn)}%)`, background: "var(--color-cy)" }} />
          ))}
        </div>
        <span ref={thumbRef} className="kf-pc-thumb" aria-hidden="true" />
      </div>

      <span className="kf-pc-spacer" aria-hidden="true" />
      <button type="button" className="kf-pc-btn" onClick={() => playerClock.toggleMute()} aria-pressed={ps.muted} aria-label="Mute" disabled={!hasMedia}>
        {ps.muted ? Icon.muted : Icon.sound}
      </button>
      <button
        type="button"
        className="kf-pc-btn kf-pc-compare"
        onClick={onToggleCompare}
        aria-pressed={compare}
        disabled={!canCompare}
        title={canCompare ? "Play the original take at this moment" : "The original take isn't available"}
      >
        {Icon.compare}<span className="kf-pc-compare-long">Compare original</span>
      </button>
      <button type="button" className="kf-pc-btn" onClick={onToggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} disabled={!hasMedia}>
        {fullscreen ? Icon.exitFull : Icon.full}
      </button>
    </div>
  );
}
