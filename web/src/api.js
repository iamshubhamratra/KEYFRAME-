// KEYFRAME API client. Same-origin in production (served by Express);
// the vite dev server proxies /api and /videos to :8080.

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
    return json(await fetch("/api/projects", { method: "POST", body: form }));
  }
  return json(await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rest),
  }));
}

export async function getProject(id) {
  return json(await fetch(`/api/projects/${id}`));
}

export async function approveProject(id, script) {
  return json(await fetch(`/api/projects/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(script ? { script } : {}),
  }));
}

export async function regenerateProject(id, from = "script") {
  return json(await fetch(`/api/projects/${id}/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from }),
  }));
}

export async function listFrames() {
  return json(await fetch("/api/frames"));
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
