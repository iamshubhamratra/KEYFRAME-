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

// fields: { prompt?, websiteUrl?, referenceVideo? (File), duration, orientation,
//           quality, framePack, voiceStyle?, autopilot?, captions? }
export async function createProject(fields) {
  const { referenceVideo, ...rest } = fields;
  if (referenceVideo) {
    const form = new FormData();
    form.append("referenceVideo", referenceVideo);
    for (const [k, v] of Object.entries(rest)) {
      if (v != null && v !== "") form.append(k, String(v));
    }
    return json(await apiFetch("/api/projects", { method: "POST", body: form }));
  }
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
