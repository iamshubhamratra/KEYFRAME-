// A small History-API router: the address bar is the source of truth for which
// screen is showing, so Back/Forward, refresh and shared links all work.
//
//   useRoute()                      -> { name, params, state, path, title, auth }
//   navigate(name, params, opts)    -> pushes (or, with { replace: true }, replaces) an entry
//   <Link to="templates">           -> ./Link.jsx: a real <a href> that navigates without a reload

import { useSyncExternalStore } from "react";
import { ROUTES, NOT_FOUND, legacyRedirect } from "./routes.js";

const compiled = ROUTES.map((route) => {
  const keys = [];
  const source = route.path
    .split("/")
    .map((seg) => (seg.startsWith(":") ? (keys.push(seg.slice(1)), "([^/]+)") : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return { route, keys, re: new RegExp(`^${source}/?$`) };
});
const byName = new Map(ROUTES.map((r) => [r.name, r]));

function match(pathname) {
  for (const { route, keys, re } of compiled) {
    const m = re.exec(pathname);
    if (!m) continue;
    const params = {};
    try {
      keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    } catch { break; } // a malformed %-escape is not a URL we serve
    return { ...route, params };
  }
  return { ...NOT_FOUND, params: {} };
}

// The URL for a named route. Unknown names and missing params throw: a broken
// link should fail loudly in development, not land on the 404 screen.
export function pathFor(name, params = {}) {
  const r = byName.get(name);
  if (!r) throw new Error(`unknown route "${name}"`);
  return r.path.replace(/:(\w+)/g, (_, k) => {
    if (params[k] == null || params[k] === "") throw new Error(`route "${name}" needs :${k}`);
    return encodeURIComponent(params[k]);
  });
}

// ---- the location store --------------------------------------------------
const listeners = new Set();
let navCount = 0;
let replaceNext = false;
let snapshot = null;

function read() {
  const { pathname, search } = window.location;
  const route = match(pathname);
  return { ...route, path: pathname + search, search, state: window.history.state || null };
}

function emit() {
  snapshot = read();
  document.title = snapshot.name === "landing" ? "KEYFRAME" : `${snapshot.title} — KEYFRAME`;
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  const legacy = legacyRedirect(window.location.search);
  if (legacy) window.history.replaceState(null, "", legacy);
  window.addEventListener("popstate", emit);
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRoute() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

// Go to a named route. `state` rides along in history (it survives refresh and
// Back/Forward); `replace` swaps the current entry instead of adding one.
export function navigate(name, params = {}, { replace = false, state = null } = {}) {
  navigateTo(pathFor(name, params), { replace, state });
}

export function navigateTo(path, { replace = false, state = null } = {}) {
  const current = window.location.pathname + window.location.search;
  if (replaceNext) { replace = true; replaceNext = false; }
  if (path === current) replace = true; // never stack duplicate entries
  window.history[replace ? "replaceState" : "pushState"](state, "", path);
  navCount++;
  emit();
}

// Increments on every in-app navigation — lets a caller tell whether some code it
// ran moved the user anywhere.
export const navigationCount = () => navCount;

// Make the NEXT navigation replace the current entry, whoever triggers it. Used to
// let a post-login destination take over the /login entry, so Back from it goes to
// the page the visitor was on rather than to a login form they already used.
export function replaceNextNavigation() { replaceNext = true; }
