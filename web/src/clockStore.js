// CLOCK STORE — a coarse "now" for relative times ("2 min ago") without Date.now() in render.
//
// React renders must be pure, so components read the time from this external store instead of
// calling Date.now(). The interval runs only while something is subscribed and ticks every 30 s
// (relative labels never need more). On the first subscriber the value is refreshed immediately,
// so a page opened long after the module loaded never shows a stale "just now".

import { useSyncExternalStore } from "react";

export const TICK_MS = 30_000;

const listeners = new Set();
let now = Date.now();
let timer = null;

function emit() {
  for (const fn of [...listeners]) { try { fn(); } catch { /* keep ticking the others */ } }
}

function tick() {
  now = Date.now();
  emit();
}

export function subscribeNow(fn) {
  listeners.add(fn);
  if (listeners.size === 1) {
    if (Date.now() - now > 1000) { now = Date.now(); queueMicrotask(emit); }
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) { clearInterval(timer); timer = null; }
  };
}

export const getNow = () => now;

// The current coarse time in ms; re-renders every 30 s while mounted.
export function useNow() {
  return useSyncExternalStore(subscribeNow, getNow, getNow);
}
