// PLAYER CLOCK — the preview's playhead, outside React.
//
// A <video> reports its time up to 60×/s; putting that in React state would re-render the whole
// editor every frame. Instead the clock owns the element's events and a requestAnimationFrame
// loop, and exposes three subscriptions:
//   · subscribe(fn)            — play/pause/duration/mute changes (usePlayerState)
//   · subscribeTime(fn, qMs)   — time, quantized (usePlayerTime(250) re-renders 4×/s at most)
//   · subscribeFrame(fn)       — every animation frame with the exact time, for DOM-only updates
//                                 (playhead transform, the transcript's live word class)
// The editor's two stacked <video> elements swap by calling attach() on the new one.

import { useCallback, useSyncExternalStore } from "react";

const EVENTS = ["play", "playing", "pause", "seeking", "seeked", "timeupdate", "durationchange", "loadedmetadata", "volumechange", "ended", "waiting", "canplay", "ratechange", "emptied", "error"];

export const quantize = (t, quantMs = 250) => {
  const q = Math.max(1, Number(quantMs) || 250) / 1000;
  return Math.round(Math.floor((Number(t) || 0) / q) * q * 1000) / 1000;
};

export function createPlayerClock({ fps = 30 } = {}) {
  let el = null;
  let raf = 0;
  let time = 0;
  let state = Object.freeze({ playing: false, duration: 0, muted: false, ended: false, waiting: false, ready: false, error: false, rate: 1 });
  const stateListeners = new Set();
  const timeListeners = new Set();
  const frameListeners = new Set();
  const hasRaf = typeof requestAnimationFrame === "function";

  const notifyTime = () => {
    for (const fn of [...timeListeners]) { try { fn(time); } catch { /* keep others */ } }
    for (const fn of [...frameListeners]) { try { fn(time); } catch { /* keep others */ } }
  };
  const notifyState = () => { for (const fn of [...stateListeners]) { try { fn(); } catch { /* keep others */ } } };

  function readState() {
    if (!el) return;
    const next = {
      playing: !el.paused && !el.ended,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
      muted: !!el.muted,
      ended: !!el.ended,
      waiting: state.waiting,
      ready: el.readyState >= 2,
      error: !!el.error,
      rate: el.playbackRate || 1,
    };
    const changed = Object.keys(next).some((k) => next[k] !== state[k]);
    if (changed) { state = Object.freeze(next); notifyState(); }
  }

  function loop() {
    raf = 0;
    if (!el) return;
    const t = el.currentTime || 0;
    if (t !== time) { time = t; notifyTime(); }
    if (!el.paused && !el.ended && hasRaf) raf = requestAnimationFrame(loop);
  }

  function onEvent(e) {
    if (!el) return;
    if (e.type === "waiting") state = Object.freeze({ ...state, waiting: true });
    if (e.type === "playing" || e.type === "canplay" || e.type === "seeked") state = Object.freeze({ ...state, waiting: false });
    readState();
    const t = el.currentTime || 0;
    if (t !== time) { time = t; notifyTime(); }
    if (!el.paused && !raf && hasRaf) raf = requestAnimationFrame(loop);
  }

  function detach(videoEl) {
    if (!el || (videoEl && videoEl !== el)) return;
    for (const ev of EVENTS) el.removeEventListener(ev, onEvent);
    if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    raf = 0;
    el = null;
  }

  function attach(videoEl) {
    if (videoEl === el) return () => detach(videoEl);
    detach();
    el = videoEl || null;
    if (!el) return () => {};
    for (const ev of EVENTS) el.addEventListener(ev, onEvent);
    time = el.currentTime || 0;
    readState();
    notifyTime();
    if (!el.paused && hasRaf) raf = requestAnimationFrame(loop);
    return () => detach(videoEl);
  }

  function seek(t) {
    const d = state.duration || (el && Number.isFinite(el.duration) ? el.duration : 0);
    const target = Math.max(0, d ? Math.min(Number(t) || 0, Math.max(0, d - 0.001)) : Number(t) || 0);
    time = target;
    if (el) { try { el.currentTime = target; } catch { /* not seekable yet */ } }
    notifyTime();
    return target;
  }

  const play = () => {
    if (!el) return Promise.resolve(false);
    try {
      const p = el.play();
      return p && typeof p.then === "function" ? p.then(() => true, () => false) : Promise.resolve(true);
    } catch { return Promise.resolve(false); }
  };
  const pause = () => { if (el) el.pause(); };

  return {
    attach,
    detach,
    getElement: () => el,
    getTime: () => time,
    getSnapshot: () => state,
    subscribe(fn) { stateListeners.add(fn); return () => stateListeners.delete(fn); },
    subscribeTime(fn, quantMs = 250) {
      let last = quantize(time, quantMs);
      const wrapped = () => {
        const q = quantize(time, quantMs);
        if (q !== last) { last = q; fn(); }
      };
      timeListeners.add(wrapped);
      return () => timeListeners.delete(wrapped);
    },
    subscribeFrame(fn) { frameListeners.add(fn); return () => frameListeners.delete(fn); },
    seek,
    seekBy: (dt) => seek(time + (Number(dt) || 0)),
    stepFrames(n = 1) {
      if (el && !el.paused) el.pause();
      return seek(Math.round((time + n / fps) * fps) / fps);
    },
    play,
    pause,
    toggle() {
      if (!el) return Promise.resolve(false);
      if (el.paused || el.ended) return play();
      el.pause();
      return Promise.resolve(false);
    },
    setMuted(m) { if (el) el.muted = !!m; },
    toggleMute() { if (el) el.muted = !el.muted; },
    // For the A/B swap: move the playhead value without an element (e.g. before the new one attaches).
    setTime(t) { time = Math.max(0, Number(t) || 0); notifyTime(); },
  };
}

// The editor's shared clock.
export const playerClock = createPlayerClock();

export function usePlayerTime(quantMs = 250, clock = playerClock) {
  const subscribe = useCallback((cb) => clock.subscribeTime(cb, quantMs), [clock, quantMs]);
  const get = useCallback(() => quantize(clock.getTime(), quantMs), [clock, quantMs]);
  return useSyncExternalStore(subscribe, get, get);
}

export function usePlayerState(clock = playerClock) {
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}
