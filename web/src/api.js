// KEYFRAME API client.
// - Same-origin when VITE_API_URL is unset (all-in-one host / vite dev proxy).
// - Split deploy (frontend on Vercel, backend on Render): set VITE_API_URL at
//   build time to the backend origin; all /api + media URLs are prefixed with it.
export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

// Prefix a backend-relative URL ("/videos/x.mp4", "/frames/...", "/showcase.mp4")
// with the API origin. Absolute URLs and falsy values pass through untouched.
export const mediaUrl = (u) =>
  typeof u === "string" && u.startsWith("/") ? API_BASE + u : u;

// credentials:"include" so the httpOnly auth cookie flows on every call
// (required cross-origin for the Vercel↔Render split deploy).
const apiFetch = (path, opts = {}) => fetch(API_BASE + path, { credentials: "include", ...opts });
const jpost = (path, body) => apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

// ---------------- auth ----------------
export async function signup({ name, email, password }) { return json(await jpost("/api/auth/signup", { name, email, password })); }
export async function login({ email, password }) { return json(await jpost("/api/auth/login", { email, password })); }
export async function logout() { return json(await apiFetch("/api/auth/logout", { method: "POST" })); }
export async function fetchMe() { return json(await apiFetch("/api/auth/me")); }
export async function sendResetOtp(email) { return json(await jpost("/api/auth/forgot/send-otp", { email })); }
export async function verifyResetOtp(email, otp) { return json(await jpost("/api/auth/forgot/verify-otp", { email, otp })); }
export async function setNewPassword(email, newPassword) { return json(await jpost("/api/auth/forgot/set-new-password", { email, newPassword })); }

async function json(resp) {
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    // `details` is a list of strings on the project routes but a list of VALIDATION OBJECTS on
    // the admin template routes (send() forwards err.errors verbatim). A bare .join() on those
    // renders "[object Object]" — which is exactly the case where the admin most needs to read
    // what the validator said — so each entry is reduced to its human field first.
    const detail = Array.isArray(body.details) && body.details.length
      ? ": " + body.details.map((d) => (typeof d === "string" ? d : d.detail || d.message || JSON.stringify(d))).join("; ")
      : "";
    const err = new Error((body.error || `HTTP ${resp.status}`) + detail);
    // The admin publish gate answers 409 with a MACHINE-READABLE blocker list, and the review
    // page is required to show every blocker (and its fix) verbatim. Flattening that into the
    // message would destroy it, so the structured fields ride along on the error itself.
    // Existing callers read only .message and are unaffected.
    err.status = resp.status;
    if (body.code) err.code = body.code;
    if (Array.isArray(body.blocking)) err.blocking = body.blocking;
    throw err;
  }
  return body;
}

// fields: { prompt?, websiteUrl?, referenceVideo? (File), logo? (File),
//           assets? (File[]), duration, orientation, quality, framePack,
//           voiceStyle?, autopilot?, captions?, brandPalette? }
export async function createProject(fields) {
  const isFile = (v) => typeof File !== "undefined" && v instanceof File;
  // Multipart whenever ANY field carries a File — referenceVideo, logo, or the
  // assets array. (JSON.stringify on a File silently serializes to {}, so a File
  // must never reach the JSON branch.)
  const hasFiles = Object.values(fields).some((v) => isFile(v) || (Array.isArray(v) && v.some(isFile)));
  if (hasFiles) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || v === "") continue;
      if (isFile(v)) { form.append(k, v); continue; }
      // A File[] appends repeatedly under ONE key — multer's upload.fields
      // collects them as req.files[k].
      if (Array.isArray(v) && v.some(isFile)) { for (const f of v) if (isFile(f)) form.append(k, f); continue; }
      // A multipart field is text, so a structured one (brandPalette) has to travel
      // as JSON — String(object) would post the literal "[object Object]". The API
      // parses these back; the JSON path below needs no such dance.
      form.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    return json(await apiFetch("/api/projects", { method: "POST", body: form }));
  }
  const { referenceVideo, logo, assets, ...rest } = fields;
  return json(await apiFetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rest),
  }));
}

export async function getProject(id) {
  return json(await apiFetch(`/api/projects/${id}`));
}

export async function approveProject(id, script) {
  return json(await apiFetch(`/api/projects/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(script ? { script } : {}),
  }));
}

export async function regenerateProject(id, from = "script") {
  return json(await apiFetch(`/api/projects/${id}/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from }),
  }));
}

export async function listFrames() {
  return json(await apiFetch("/api/frames"));
}

// ---------------- admin: templates ----------------
// Every route below is behind requireAuth + requireAdmin on the server. Hiding the admin
// screens in App.jsx is cosmetic; THIS is where an unauthorized call gets a 403.
const ADMIN = "/api/admin/templates";
const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

// -> { templates[], statuses[], scenarios[] }. `statuses` is the lifecycle vocabulary itself:
// the dashboard's filter pills are built from it so the client never keeps a second copy of
// the state machine.
export async function adminListTemplates({ status, q, family } = {}) {
  return json(await apiFetch(ADMIN + query({ status, q, family })));
}
// -> { template, versions[], scenarios[] }
export async function adminGetTemplate(id) { return json(await apiFetch(`${ADMIN}/${id}`)); }
export async function adminCreateTemplate(fields) { return json(await jpost(ADMIN, fields)); }
export async function adminUpdateTemplate(id, patch) {
  return json(await apiFetch(`${ADMIN}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch || {}) }));
}
export async function adminDeleteTemplate(id) { return json(await apiFetch(`${ADMIN}/${id}`, { method: "DELETE" })); }

// The four asynchronous actions. Each answers 202 with the record as it stands at that instant
// — the real result arrives on the event stream below, never in this response.
export async function adminGenerate(id, feedback) { return json(await jpost(`${ADMIN}/${id}/generate`, feedback ? { feedback } : {})); }
export async function adminPreview(id, count) { return json(await jpost(`${ADMIN}/${id}/preview`, count ? { count } : {})); }
export async function adminQa(id) { return json(await jpost(`${ADMIN}/${id}/qa`, {})); }
export async function adminPublish(id) { return json(await jpost(`${ADMIN}/${id}/publish`, {})); }

// A real film through the real pipeline, pinned to this template -> { projectId, ... }.
export async function adminTest(id, scenario) { return json(await jpost(`${ADMIN}/${id}/test`, scenario ? { scenario } : {})); }

export async function adminUnpublish(id) { return json(await jpost(`${ADMIN}/${id}/unpublish`, {})); }
export async function adminArchive(id) { return json(await jpost(`${ADMIN}/${id}/archive`, {})); }
// THE POST-PUBLISH FIX LOOP. `adminNewVersion` clones the version into a new row, slug and
// directory — the one being fixed is never written to — and answers with the NEW record, which
// the detail screen then opens. `adminRollback` promotes a superseded version back to live and
// retires whatever replaced it; it is synchronous because it renders nothing.
// `fix: true` also STARTS the regeneration on the clone, so "fix this defect" is one act rather
// than clone-here-then-find-regenerate-over-there. The server builds the brief from the issues
// the clone inherits, so nothing has to be retyped.
export async function adminNewVersion(id, { changes, fix } = {}) {
  return json(await jpost(`${ADMIN}/${id}/versions`, { ...(changes ? { changes } : {}), ...(fix ? { fix: true } : {}) }));
}
export async function adminRollback(id) { return json(await jpost(`${ADMIN}/${id}/rollback`, {})); }

// ---------------- admin: batch generation ----------------
// "Generate N templates": the server plans N creative directions, then runs each through the same
// single-template pipeline one at a time. 202 + a stream, like every other long admin action.
const ADMIN_BATCHES = "/api/admin/batches";
export async function adminListBatches() { return json(await apiFetch(ADMIN_BATCHES)); }
export async function adminStartBatch(config) { return json(await jpost(ADMIN_BATCHES, config)); }
export async function adminGetBatch(id) { return json(await apiFetch(`${ADMIN_BATCHES}/${id}`)); }
export async function adminCancelBatch(id) { return json(await jpost(`${ADMIN_BATCHES}/${id}/cancel`, {})); }

// Same contract as subscribeTemplate: every message is the whole shaped batch, and the server
// ends the stream once the run is terminal.
export function subscribeBatch(id, { onUpdate, onClose } = {}) {
  // withCredentials for the same reason subscribeTemplate needs it: an EventSource carries no
  // headers, so the httpOnly auth cookie is the only way this stream authenticates cross-origin.
  const es = new EventSource(`${API_BASE}${ADMIN_BATCHES}/${id}/events`, { withCredentials: true });
  let closed = false;
  const stop = () => { if (!closed) { closed = true; es.close(); } };
  es.onmessage = (e) => { try { onUpdate?.(JSON.parse(e.data)); } catch { /* a partial frame is not an error */ } };
  es.onerror = () => { stop(); onClose?.(); };
  return stop;
}

// Defects found by watching a real film, recorded against the version they were seen on and
// carried forward onto the version created to fix them.
export async function adminAddIssue(id, issue) { return json(await jpost(`${ADMIN}/${id}/issues`, issue)); }
export async function adminSetIssueStatus(id, issueId, status) {
  return json(await apiFetch(`${ADMIN}/${id}/issues/${issueId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
  }));
}

// Live progress for one template. Each SSE message is the whole shaped record, so a screen
// just replaces its state — there is no event vocabulary to keep in sync.
//
// THE STREAM ENDS ITSELF. The server calls res.end() once nothing is running and the template
// is in a state the admin acts on next. The EventSource spec treats a closed connection as a
// DROP and reconnects forever, which against a finished template is an endless 1s poll loop —
// so this closes the source on the first error instead of letting the browser retry, and tells
// the caller through onClose. A caller that still needs updates re-subscribes deliberately.
// Returns an unsubscribe function.
export function subscribeTemplate(id, { onUpdate, onClose } = {}) {
  // withCredentials so the httpOnly auth cookie flows on the split (Vercel↔Render) deploy —
  // an EventSource cannot carry headers, and without this the stream 401s cross-origin.
  const es = new EventSource(`${API_BASE}${ADMIN}/${id}/events`, { withCredentials: true });
  let closed = false;
  const stop = () => { if (!closed) { closed = true; es.close(); } };
  es.onmessage = (e) => {
    try { onUpdate?.(JSON.parse(e.data)); } catch { /* a partial frame is not worth a crash */ }
  };
  es.onerror = () => { stop(); onClose?.(); };
  return stop;
}

// Poll a project until `predicate(project)` is true (or a terminal status).
// onTick fires on every poll so screens can render live progress.
export function pollProject(id, { intervalMs = 1500, onTick, predicate, signal } = {}) {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (signal?.aborted) return reject(new Error("aborted"));
      let p;
      try { p = await getProject(id); } catch (e) { return reject(e); }
      onTick?.(p);
      const terminal = ["done", "failed"].includes(p.status);
      if (predicate?.(p) || terminal) return resolve(p);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}
