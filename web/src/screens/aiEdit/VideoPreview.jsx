import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import { useEditor, useEditorActions } from "../../editState.js";
import { playerClock, usePlayerState } from "../../playerClock.js";
import { isFixtureMode } from "../../editApi.js";
import { fmtEtaShort } from "../../editFormat.js";

// VIDEO PREVIEW (UX.md §1d, §2) — a real server render of ONE revision, never DOM-faked captions.
// Two stacked <video playsInline> elements swap without a flash: the next revision (or the
// original take for "Compare original") loads in the hidden one, its playhead is mapped through the
// source moment (old TimeMap → source seconds → new TimeMap, snapping forward past a new cut), and
// only after `seeked` + a decodable frame do the two flip — instantly with reduced motion. If a new
// render won't load, or playback breaks, the last good render stays up with PREVIEW JAMMED.

const RATIO = { "9:16": 9 / 16, "16:9": 16 / 9, "1:1": 1 };
const videoStyle = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "var(--color-dark-2)", opacity: 0, zIndex: 1 };
const MEDIA_EVENTS = ["loadedmetadata", "seeked", "canplay", "loadeddata", "error"];

function waitForFrame(el, time, signal, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let done = false;
    let seeked = false;
    let timer = null;
    const cleanup = () => {
      for (const ev of MEDIA_EVENTS) el.removeEventListener(ev, on);
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (err) => {
      if (done) return;
      done = true;
      cleanup();
      if (err) reject(err); else resolve();
    };
    function onAbort() { finish(Object.assign(new Error("Aborted"), { name: "AbortError" })); }
    const check = () => { if (seeked && el.readyState >= 2) finish(); };
    const seek = () => {
      const d = Number.isFinite(el.duration) ? el.duration : 0;
      const target = d ? Math.min(Math.max(0, time), Math.max(0, d - 0.05)) : Math.max(0, time);
      if (Math.abs(el.currentTime - target) < 0.01) { seeked = true; check(); return; }
      try { el.currentTime = target; } catch { seeked = true; check(); }
    };
    function on(e) {
      if (e.type === "error") { finish(new Error("The preview couldn't be loaded.")); return; }
      if (e.type === "loadedmetadata") { seek(); return; }
      if (e.type === "seeked") seeked = true;
      check();
    }
    for (const ev of MEDIA_EVENTS) el.addEventListener(ev, on);
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => finish(new Error("The preview took too long to load.")), timeoutMs);
    if (el.readyState >= 1) seek();
  });
}

const badge = (extra = {}) => ({
  position: "absolute", zIndex: 5, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999,
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", whiteSpace: "nowrap",
  color: "var(--color-dark-ink)", background: "rgba(13,11,7,.72)", backdropFilter: "blur(6px)", border: "1px solid rgba(242,237,226,.14)",
  pointerEvents: "none",
  ...extra,
});

export default function VideoPreview({ compare = false, stageRef, fullscreen = false, onToggleFullscreen }) {
  const f = useEditorActions();
  const reduce = useReducedMotion();
  const ps = usePlayerState();
  const previewRevision = useEditor((s) => s.previewRevision);
  const previewRenderId = useEditor((s) => s.previewRenderId);
  const render = useEditor((s) => s.render);
  const aspect = useEditor((s) => s.plan?.output?.aspect) || "9:16";
  const title = useEditor((s) => s.plan?.title || s.view?.title || "");
  const aRef = useRef(null);
  const bRef = useRef(null);
  const cur = useRef({ active: 0, key: null });
  const [shown, setShown] = useState({ key: null, rev: null, source: false });
  const [jam, setJam] = useState(null);
  const [retry, setRetry] = useState(0);

  const previewUrl = useSyncExternalStore(f.media.subscribe, () => (previewRenderId ? f.media.get("preview", previewRenderId) : null));
  const sourceUrl = useSyncExternalStore(f.media.subscribe, () => (compare ? f.media.get("source-proxy") : null));
  const posterUrl = useSyncExternalStore(f.media.subscribe, () => f.media.get("poster"));

  useEffect(() => { if (previewRenderId) f.media.request("preview", previewRenderId); }, [f, previewRenderId]);
  useEffect(() => { if (compare) f.media.request("source-proxy"); }, [f, compare]);
  useEffect(() => { f.media.request("poster"); }, [f]);

  // One clock for the editor: start from zero, let go of the elements when the editor closes.
  useEffect(() => {
    const els = [aRef.current, bRef.current];
    playerClock.detach();
    playerClock.setTime(0);
    f.clearShown();
    const onError = (e) => {
      if (e.currentTarget !== playerClock.getElement()) return;
      setJam({ playing: true });
    };
    for (const el of els) el?.addEventListener("error", onError);
    return () => {
      for (const el of els) { el?.removeEventListener("error", onError); try { el?.pause(); } catch { /* gone */ } }
      playerClock.detach();
      f.clearShown();
    };
  }, [f]);

  const tKey = compare && sourceUrl ? "source" : previewUrl ? `r${previewRevision}:${previewRenderId}` : null;
  const tUrl = compare && sourceUrl ? sourceUrl : previewUrl;
  const tRev = compare && sourceUrl ? null : previewRevision;

  // The swap.
  useEffect(() => {
    const els = [aRef.current, bRef.current];
    if (!tKey || !tUrl || !els[0] || !els[1]) return undefined;
    const c = cur.current;
    if (c.key === tKey) return undefined;
    const ac = new AbortController();
    const from = c.key ? els[c.active] : null;
    const toIdx = c.key ? 1 - c.active : c.active;
    const to = els[toIdx];
    const wasPlaying = !!from && !from.paused && !from.ended;
    const run = async () => {
      const fromTime = from ? from.currentTime : playerClock.getTime();
      const pieces = tKey === "source" ? "source" : await f.piecesForRevision(tRev);
      if (ac.signal.aborted) return;
      const at = f.mapShownTo(fromTime, pieces);
      to.muted = from ? from.muted : to.muted;
      to.src = tUrl;
      await waitForFrame(to, at, ac.signal);
      if (ac.signal.aborted) return;
      if (tKey === "source") f.setShownSource(); else f.setShownRevision(tRev, pieces);
      playerClock.attach(to);
      if (wasPlaying) { try { await to.play(); } catch { /* autoplay refused: stays paused on the frame */ } }
      to.style.opacity = "1";
      to.style.zIndex = "2";
      if (from) { from.style.opacity = "0"; from.style.zIndex = "1"; try { from.pause(); } catch { /* ignore */ } }
      c.active = toIdx;
      c.key = tKey;
      setShown({ key: tKey, rev: tRev, source: tKey === "source" });
      setJam(null);
      if (from) {
        setTimeout(() => {
          if (cur.current.active === toIdx) { from.removeAttribute("src"); try { from.load(); } catch { /* ignore */ } }
        }, reduce ? 0 : 450);
      }
    };
    run().catch((err) => {
      if (err?.name === "AbortError" || ac.signal.aborted) return;
      if (cur.current.active !== toIdx || !c.key) { to.removeAttribute("src"); try { to.load(); } catch { /* ignore */ } }
      setJam({ rev: tRev, source: tKey === "source", message: err?.message });
    });
    return () => ac.abort();
  }, [tKey, tUrl, tRev, f, reduce, retry]);

  const updating = render && render.kind !== "export" && (render.status === "running" || render.status === "queued");
  const ready = !!shown.key;
  const ratio = RATIO[aspect] || RATIO["9:16"];
  const placeholder = !previewRenderId
    ? "● ROLLING THE FIRST PREVIEW"
    : !previewUrl
      ? (isFixtureMode() ? "FIXTURE MODE · NO PREVIEW VIDEO LOADED" : "LOADING PREVIEW…")
      : "LOADING PREVIEW…";

  return (
    <section
      ref={stageRef}
      aria-label={`Preview${title ? ` of ${title}` : ""}`}
      data-kf-zone="player"
      style={{ position: "relative", display: "flex", justifyContent: "center", minWidth: 0, background: fullscreen ? "#000" : "transparent", alignItems: "center", ...(fullscreen ? { width: "100vw", height: "100vh" } : {}) }}
    >
      <div
        onClick={() => { if (ready) playerClock.toggle(); }}
        style={{
          position: "relative", width: fullscreen ? `min(100vw, calc(100vh * ${ratio}))` : `min(100%, calc(var(--kf-stage-max, 62dvh) * ${ratio}))`,
          aspectRatio: `${ratio}`, maxWidth: "100%", borderRadius: fullscreen ? 0 : 16, overflow: "hidden",
          background: "var(--color-dark-2)", border: fullscreen ? 0 : "1px solid rgba(242,237,226,.1)", boxShadow: fullscreen ? "none" : "0 30px 70px rgba(0,0,0,.5)",
          cursor: ready ? "pointer" : "default",
        }}
      >
        <video ref={aRef} playsInline preload="auto" aria-hidden="true" tabIndex={-1} disablePictureInPicture style={{ ...videoStyle, transition: reduce ? "none" : "opacity .22s ease" }} />
        <video ref={bRef} playsInline preload="auto" aria-hidden="true" tabIndex={-1} disablePictureInPicture style={{ ...videoStyle, transition: reduce ? "none" : "opacity .22s ease" }} />

        {!ready && (
          <div style={{ position: "absolute", inset: 0, zIndex: 3, display: "grid", placeItems: "center", textAlign: "center" }}>
            {posterUrl && <img src={posterUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.4 }} />}
            <div className="film-scan" style={{ opacity: 0.35 }} />
            <span role="status" style={{ position: "relative", padding: "0 16px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--color-dark-ink)" }}>{jam ? "PREVIEW JAMMED" : placeholder}</span>
          </div>
        )}

        {ready && !ps.playing && !jam?.playing && (
          <button
            type="button"
            className="play-glass"
            aria-label="Play preview"
            onClick={(e) => { e.stopPropagation(); playerClock.play(); }}
            style={{ position: "absolute", zIndex: 4, left: "50%", top: "50%", transform: "translate(-50%,-50%)", cursor: "pointer" }}
          />
        )}

        {shown.key && (
          <span style={badge({ top: 12, left: 12 })}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: shown.source ? "var(--color-cy)" : "var(--color-lm)" }} />
            {shown.source ? "ORIGINAL TAKE" : `PREVIEW r${shown.rev}`}
          </span>
        )}
        {updating && (
          <span style={badge({ top: 12, right: 12, borderColor: "rgba(232,50,168,.5)" })}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-mag)", animation: "kf2-blink 1s steps(1) infinite" }} />
            {render.status === "queued" ? "UPDATE QUEUED" : `UPDATING ${Math.round(Number(render.pct) || 0)}%${render.etaSec ? ` · ${fmtEtaShort(render.etaSec)}` : ""}`}
          </span>
        )}
        {jam && ready && (
          <div role="alert" style={{ position: "absolute", zIndex: 6, left: 12, right: 12, bottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 8px 8px 14px", borderRadius: 12, background: "rgba(13,11,7,.86)", border: "1px solid rgba(216,39,27,.55)" }}>
            <span style={{ flex: 1, minWidth: 140, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dark-ink)" }}>
              <span aria-hidden="true" style={{ color: "#ff6a3c" }}>✕ </span>PREVIEW JAMMED{shown.rev != null ? ` · SHOWING r${shown.rev}` : ""}
            </span>
            <button
              type="button"
              className="btn-ink on-dark"
              onClick={(e) => { e.stopPropagation(); if (jam.playing) cur.current.key = null; setJam(null); setRetry((n) => n + 1); }}
              style={{ minHeight: 44, padding: "8px 16px", fontSize: 13 }}
            >
              Retry
            </button>
          </div>
        )}
        {fullscreen && (
          <button type="button" className="btn-outline-dark btn-sm" onClick={(e) => { e.stopPropagation(); onToggleFullscreen?.(); }} style={{ position: "absolute", zIndex: 6, right: 16, bottom: 16, minHeight: 44, background: "rgba(13,11,7,.6)" }}>
            Exit full screen
          </button>
        )}
      </div>
    </section>
  );
}
