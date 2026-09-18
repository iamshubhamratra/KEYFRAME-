// DEEP LINKS for AI Video Edit — `?edit=<id>` opens one edit, `?edits` opens My edits.
//
// App has no router; its view lives in state. Reading the URL once in App's state initializers
// (readDeepLink) lets a refresh or a shared link land on the right screen, and the session writes
// the param back with history.replaceState — never pushState, so Back still leaves the studio.
// Ids are validated with the server's own regex before they reach any request.

export const EDIT_ID_RE = /^ve_[0-9a-z]{16}$/;
export const isEditId = (id) => typeof id === "string" && EDIT_ID_RE.test(id);

const hasWindow = () => typeof window !== "undefined" && !!window.location;

export function readDeepLink(search) {
  const s = search ?? (hasWindow() ? window.location.search : "");
  let params;
  try { params = new URLSearchParams(s); } catch { return null; }
  const id = params.get("edit");
  if (id !== null) return isEditId(id) ? { view: "aiEdit", id } : null;
  if (params.has("edits")) return { view: "aiEdits" };
  return null;
}

function replaceParams(mutate) {
  if (!hasWindow() || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    mutate(url.searchParams);
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  } catch { /* a sandboxed or exotic location: the link simply isn't written */ }
}

export function writeEditParam(id) {
  if (!isEditId(id)) return;
  replaceParams((p) => { p.delete("edits"); p.set("edit", id); });
}

export function clearEditParam() {
  replaceParams((p) => p.delete("edit"));
}

export function writeListParam() {
  replaceParams((p) => { p.delete("edit"); p.set("edits", ""); });
}

export function clearListParam() {
  replaceParams((p) => p.delete("edits"));
}

// A shareable absolute link to one edit (the recipient still needs to own it).
export function editLink(id) {
  if (!isEditId(id) || !hasWindow()) return "";
  const url = new URL(window.location.href);
  url.search = `?edit=${id}`;
  url.hash = "";
  return url.toString();
}
