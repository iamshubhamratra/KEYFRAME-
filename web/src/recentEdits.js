// RECENT EDITS — the "continue where you left off" strip on the upload page.
//
// Stored in localStorage under a versioned key so a future shape change can discard old data
// instead of crashing on it. Every access is wrapped: private windows, disabled storage and quota
// errors all degrade to "no recent edits", never to a thrown render. The server's list stays the
// source of truth; this only remembers ids (and a title for the strip) on this browser.
//
// Exposed as an external store (subscribe/getSnapshot) so components read it with
// useSyncExternalStore and another tab's change (storage event) re-renders them.

export const RECENT_KEY = "kf.aiEdit.v1";
const VERSION = 1;
const MAX = 12;
const EMPTY = Object.freeze([]);

const listeners = new Set();
let cache = null;

function storage() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

function read() {
  const ls = storage();
  if (!ls) return EMPTY;
  try {
    const raw = ls.getItem(RECENT_KEY);
    if (!raw) return EMPTY;
    const data = JSON.parse(raw);
    if (!data || data.v !== VERSION || !Array.isArray(data.recent)) return EMPTY;
    return Object.freeze(data.recent
      .filter((r) => r && typeof r.id === "string" && /^ve_[0-9a-z]{16}$/.test(r.id))
      .slice(0, MAX)
      .map((r) => Object.freeze({ id: r.id, title: typeof r.title === "string" ? r.title.slice(0, 120) : "", at: Number(r.at) || 0 })));
  } catch {
    return EMPTY;
  }
}

function write(list) {
  cache = Object.freeze(list.slice(0, MAX).map((r) => Object.freeze({ ...r })));
  const ls = storage();
  if (ls) {
    try { ls.setItem(RECENT_KEY, JSON.stringify({ v: VERSION, recent: cache })); } catch { /* quota / disabled */ }
  }
  for (const fn of [...listeners]) { try { fn(); } catch { /* one broken listener must not starve others */ } }
}

export function getRecentSnapshot() {
  if (cache === null) cache = read();
  return cache;
}

export function subscribeRecent(fn) {
  listeners.add(fn);
  const onStorage = (e) => {
    if (e.key !== null && e.key !== RECENT_KEY) return;
    cache = read();
    fn();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function pushRecent(id, { title = "", at = Date.now() } = {}) {
  if (typeof id !== "string" || !/^ve_[0-9a-z]{16}$/.test(id)) return;
  const prev = getRecentSnapshot().filter((r) => r.id !== id);
  const old = getRecentSnapshot().find((r) => r.id === id);
  write([{ id, title: title || old?.title || "", at }, ...prev]);
}

export function removeRecent(id) {
  const list = getRecentSnapshot();
  if (!list.some((r) => r.id === id)) return;
  write(list.filter((r) => r.id !== id));
}

export function clearRecent() {
  write([]);
}
