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
    const detail = body.details ? `: ${body.details.join("; ")}` : "";
    throw new Error((body.error || `HTTP ${resp.status}`) + detail);
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
