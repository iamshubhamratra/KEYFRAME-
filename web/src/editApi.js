// AI VIDEO EDIT API CLIENT — every /api/video-edits route (docs/ai-video-edit/API.md).
//
// Deliberately separate from api.js (whose fetch wrapper is private and whose errors keep only a
// message): edit routes answer with structured errors — 409 carries the head revision, 422 the
// index and reason of the op that failed, MEDIA_REJECTED a reason code — and the editor has to act
// on each. EditApiError keeps status, code, details and retryable.
//
// Uploads go over XMLHttpRequest (fetch has no upload progress), with credentials and no custom
// headers so the request stays CORS-simple. Live updates (watchEdit) use Server-Sent Events and
// fall back to polling when a proxy buffers the stream, the browser has no EventSource, or the
// stream errors twice.
//
// FIXTURE MODE. With VITE_AI_EDIT_FIXTURES=1 or window.__KF_AI_EDIT_FIXTURES = true, nothing hits
// the network: an in-memory simulator serves web/tests/fixtures/*.json with realistic latency,
// walks an upload through the analysis stages, applies ops with editModel (the same code the
// optimistic UI uses), renders previews in four progress steps and can inject a 409 conflict.
// Fixture JSON is code-split (import.meta.glob) and only fetched when fixture mode is on.

import { API_BASE } from "./api.js";
import { applyOpLocal, validateOp, dirtyEstimate, resolvePlanLocal, mergeRanges, maxLevel, findItem, opLabel, outDuration } from "./editModel.js";
import { SERVER_STAGES, CONSENT_TERMS_VERSION } from "./editFormat.js";

const ROOT = "/api/video-edits";
export const EDIT_ID_RE = /^ve_[0-9a-z]{16}$/;
const KEY_RE = /^[a-z0-9_.-]{1,64}$/;
export const MEDIA_KINDS = Object.freeze(["source-proxy", "poster", "preview", "export", "captions", "credits", "thumbs", "waveform", "broll-thumb", "broll-preview", "card-preview", "logo", "frame"]);

export class EditApiError extends Error {
  constructor(message, status = 0, body = {}) {
    super(message || "Request failed.");
    this.name = "EditApiError";
    this.status = Number(status) || 0;
    this.body = body && typeof body === "object" ? body : {};
    this.code = this.body.error || (this.status === 0 ? "NETWORK" : `HTTP_${this.status}`);
    this.retryable = typeof this.body.retryable === "boolean" ? this.body.retryable : this.status === 0 || this.status === 429 || this.status >= 500;
    this.details = this.body.details || null;
    this.requestId = this.body.requestId || null;
  }
  get isNetwork() { return this.status === 0; }
}

const abortError = () => (typeof DOMException === "function" ? new DOMException("Aborted", "AbortError") : Object.assign(new Error("Aborted"), { name: "AbortError" }));

export function isFixtureMode() {
  try { if (import.meta.env?.VITE_AI_EDIT_FIXTURES === "1") return true; } catch { /* non-Vite */ }
  return typeof window !== "undefined" && !!window.__KF_AI_EDIT_FIXTURES;
}

export const newClientRequestId = () => {
  const bytes = new Uint8Array(12);
  (globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); }));
  return `cr_${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24)}`;
};

function assertId(id) {
  if (!EDIT_ID_RE.test(String(id))) throw new EditApiError("Not found.", 404, { error: "NOT_FOUND", message: "Not found.", retryable: false });
}

// ---------------------------------------------------------------- HTTP
async function http(path, { method = "GET", body, form, signal, query } = {}) {
  const qs = query ? Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : "";
  const url = `${API_BASE}${ROOT}${path}${qs ? `?${qs}` : ""}`;
  const init = { method, credentials: "include", signal };
  if (form) init.body = form;
  else if (method !== "GET") { init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(body ?? {}); }
  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new EditApiError("Network error — check your connection.", 0, { error: "NETWORK", retryable: true });
  }
  const text = await resp.text().catch(() => "");
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!resp.ok) throw new EditApiError(data.message || data.error || `HTTP ${resp.status}`, resp.status, data);
  return data;
}

const route = (name, real) => (...args) => (isFixtureMode() ? fixture(name, args) : real(...args));

let capabilitiesPromise = null;
export const getCapabilities = route("getCapabilities", ({ signal, fresh = false } = {}) => {
  if (!capabilitiesPromise || fresh) {
    capabilitiesPromise = http("/capabilities", { signal }).catch((e) => { capabilitiesPromise = null; throw e; });
  }
  return capabilitiesPromise;
});

export const listEdits = route("listEdits", ({ cursor, limit, status, signal } = {}) => http("", { query: { cursor, limit, status }, signal }));
export const getEdit = route("getEdit", (id, { signal } = {}) => { assertId(id); return http(`/${id}`, { signal }); });
export const getProgress = route("getProgress", (id, { signal } = {}) => { assertId(id); return http(`/${id}/progress`, { signal }); });
export const getPlan = route("getPlan", (id, { rev, signal } = {}) => { assertId(id); return http(`/${id}/plan`, { query: { rev }, signal }); });
export const getRevisions = route("getRevisions", (id, { signal } = {}) => { assertId(id); return http(`/${id}/plan/revisions`, { signal }); });
export const getTranscript = route("getTranscript", (id, { signal } = {}) => { assertId(id); return http(`/${id}/transcript`, { signal }); });

export const applyOps = route("applyOps", (id, { expectedRevision, batchId, ops }, { signal } = {}) => {
  assertId(id);
  return http(`/${id}/ops`, { method: "POST", body: { expectedRevision, batchId, ops }, signal });
});
export const undo = route("undo", (id, { expectedRevision }, { signal } = {}) => { assertId(id); return http(`/${id}/undo`, { method: "POST", body: { expectedRevision }, signal }); });
export const redo = route("redo", (id, { expectedRevision }, { signal } = {}) => { assertId(id); return http(`/${id}/redo`, { method: "POST", body: { expectedRevision }, signal }); });
export const updateSettings = route("updateSettings", (id, { expectedRevision, settings, confirmReanalyze }, { signal } = {}) => {
  assertId(id);
  return http(`/${id}/settings`, { method: "POST", body: { expectedRevision, settings, ...(confirmReanalyze ? { confirmReanalyze: true } : {}) }, signal });
});
export const getCandidates = route("getCandidates", (id, { itemId, limit, signal } = {}) => { assertId(id); return http(`/${id}/candidates`, { query: { itemId, limit }, signal }); });
export const searchCandidates = route("searchCandidates", (id, { itemId, query }, { signal } = {}) => { assertId(id); return http(`/${id}/candidates/search`, { method: "POST", body: { itemId, query }, signal }); });
export const requestRender = route("requestRender", (id, { kind = "preview", planRevision, profile }, { signal } = {}) => {
  assertId(id);
  return http(`/${id}/render`, { method: "POST", body: { kind, planRevision, ...(profile ? { profile } : {}) }, signal });
});
export const getRender = route("getRender", (id, renderId, { signal } = {}) => { assertId(id); return http(`/${id}/renders/${encodeURIComponent(renderId)}`, { signal }); });
export const getExports = route("getExports", (id, { signal } = {}) => { assertId(id); return http(`/${id}/exports`, { signal }); });
export const cancelEdit = route("cancelEdit", (id, { target = "pipeline", renderId } = {}, { signal } = {}) => { assertId(id); return http(`/${id}/cancel`, { method: "POST", body: { target, ...(renderId ? { renderId } : {}) }, signal }); });
export const retryEdit = route("retryEdit", (id, { stage, mode = "resume", continueWithout } = {}, { signal } = {}) => {
  assertId(id);
  return http(`/${id}/retry`, { method: "POST", body: { mode, ...(stage ? { stage } : {}), ...(continueWithout ? { continueWithout } : {}) }, signal });
});
export const deleteEdit = route("deleteEdit", (id, { signal } = {}) => { assertId(id); return http(`/${id}/delete`, { method: "POST", body: { confirm: id }, signal }); });
export const uploadLogo = route("uploadLogo", (id, file, { signal } = {}) => {
  assertId(id);
  const form = new FormData();
  form.append("logo", file);
  return http(`/${id}/logo`, { method: "POST", form, signal });
});
export const getPlaybackTokens = route("getPlaybackTokens", (id, items, { signal } = {}) => { assertId(id); return http(`/${id}/playback-token`, { method: "POST", body: { items }, signal }); });

// Media URL. Same-origin deploys use the auth cookie; split deploys pass a playback token.
export function mediaSrc(editId, kind, key, { token, download = false } = {}) {
  if (!EDIT_ID_RE.test(String(editId)) || !MEDIA_KINDS.includes(kind)) return null;
  if (key != null && key !== "" && !KEY_RE.test(String(key))) return null;
  if (isFixtureMode()) return fixtureMedia(editId, kind, key, { download });
  const qs = [token ? `t=${encodeURIComponent(token)}` : "", download ? "download=1" : ""].filter(Boolean).join("&");
  return `${API_BASE}${ROOT}/${editId}/media/${kind}${key != null && key !== "" ? `/${key}` : ""}${qs ? `?${qs}` : ""}`;
}

export const needsPlaybackTokens = () => {
  if (!API_BASE || typeof window === "undefined") return false;
  try { return new URL(API_BASE).origin !== window.location.origin; } catch { return false; }
};

// ---------------------------------------------------------------- upload (XHR)
// uploadEditVideo(file, { settings, logo, clientRequestId }, { onProgress, onPhase, signal })
//   → Promise<{ project, costEstimate, replayed }>
// onProgress({ loaded, total, pct, rateBps, etaSec }) · onPhase("uploading" | "verifying")
export function uploadEditVideo(file, { settings = {}, logo = null, clientRequestId = null } = {}, { onProgress, onPhase, signal } = {}) {
  if (isFixtureMode()) return fixtureUpload(file, { settings, logo, clientRequestId }, { onProgress, onPhase, signal });
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${ROOT}`);
    xhr.withCredentials = true;
    const form = new FormData();
    // Fields first: multer sees settings before it starts streaming the video part.
    form.append("settings", JSON.stringify({ ...settings, consent: { thirdPartyAi: true, termsVersion: settings?.consent?.termsVersion || CONSENT_TERMS_VERSION } }));
    if (clientRequestId) form.append("clientRequestId", clientRequestId);
    if (logo) form.append("logo", logo);
    form.append("video", file);

    const meter = createRateMeter();
    let verifying = false;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const p = meter.sample(e.loaded, e.total);
      try { onProgress?.(p); } catch { /* observer */ }
      if (e.loaded >= e.total && !verifying) { verifying = true; try { onPhase?.("verifying"); } catch { /* observer */ } }
    };
    xhr.upload.onload = () => { if (!verifying) { verifying = true; try { onPhase?.("verifying"); } catch { /* observer */ } } };
    xhr.onload = () => {
      let data;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch { data = {}; }
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ...data, replayed: xhr.status === 200 });
      else reject(new EditApiError(data.message || data.error || `HTTP ${xhr.status}`, xhr.status, data));
    };
    xhr.onerror = () => reject(new EditApiError("Upload stopped — the connection dropped.", 0, { error: "NETWORK", retryable: true, offline: typeof navigator !== "undefined" && navigator.onLine === false }));
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => reject(abortError());
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    try { onPhase?.("uploading"); } catch { /* observer */ }
    xhr.send(form);
  });
}

function createRateMeter() {
  let t0 = Date.now(), l0 = 0, rate = 0;
  return {
    sample(loaded, total) {
      const t = Date.now();
      const dt = (t - t0) / 1000;
      if (dt >= 0.5) {
        const inst = (loaded - l0) / dt;
        rate = rate ? rate * 0.6 + inst * 0.4 : inst;
        t0 = t; l0 = loaded;
      }
      const remaining = Math.max(0, total - loaded);
      return { loaded, total, pct: total ? Math.min(100, (loaded / total) * 100) : 0, rateBps: Math.max(0, Math.round(rate)), etaSec: rate > 0 ? Math.ceil(remaining / rate) : null };
    },
  };
}

// ---------------------------------------------------------------- live updates
const SSE_TYPES = ["snapshot", "progress", "stage", "discovery", "plan", "render", "candidates", "qa", "done"];
const TERMINAL = new Set(["READY", "COMPLETED", "NEEDS_ATTENTION", "FAILED", "CANCELLED"]);
const omitSeq = (d) => { const rest = { ...(d || {}) }; delete rest.seq; return rest; };
const stripInternal = (r) => { const rest = { ...r }; delete rest.startedAt; delete rest.done; delete rest.cancelled; return rest; };

// Merge one event into the last known ProjectView (returns the same object when nothing changes).
export function mergeEvent(view, type, data) {
  if (!view || !data) return view;
  const d = omitSeq(data);
  switch (type) {
    case "snapshot": return d;
    case "progress": {
      const progress = { ...(view.progress || {}) };
      for (const k of ["stage", "stagePct", "overallPct", "message", "etaSec", "queuePosition", "stageStartedAt"]) if (d[k] !== undefined) progress[k] = d[k];
      return { ...view, status: d.status ?? view.status, stage: d.stage ?? view.stage, overallPct: d.overallPct ?? view.overallPct, progress };
    }
    case "stage": {
      if (!d.stage) return view;
      const prev = view.stages?.[d.stage] || { attempts: 0, fallbacks: [] };
      const fallbacks = d.fallback ? [...(prev.fallbacks || []), d.fallback] : prev.fallbacks || [];
      return { ...view, stage: d.status === "running" ? d.stage : view.stage, stages: { ...(view.stages || {}), [d.stage]: { ...prev, status: d.status ?? prev.status, ...(d.engine ? { engine: d.engine } : {}), fallbacks } } };
    }
    case "discovery": return { ...view, discoveries: { ...(view.discoveries || {}), ...d } };
    case "plan": return { ...view, plan: { ...(view.plan || {}), ...(d.headRevision !== undefined ? { headRevision: d.headRevision } : {}), ...(d.headHash ? { headHash: d.headHash } : {}) } };
    case "render": {
      if (!d.renderId) return view;
      const renders = Array.isArray(view.renders) ? [...view.renders] : [];
      const i = renders.findIndex((r) => r.renderId === d.renderId);
      if (i >= 0) renders[i] = { ...renders[i], ...d }; else renders.push(d);
      return { ...view, renders };
    }
    case "qa": return { ...view, qaVerdict: d.verdict ?? view.qaVerdict, qaSummary: { ...(view.qaSummary || {}), verdict: d.verdict, score: d.score } };
    case "done": return d.status ? { ...view, status: d.status } : view;
    default: return view;
  }
}

// Events implied by the difference between two views (used by the polling transport).
export function diffViewEvents(prev, next) {
  if (!prev || !next) return [];
  const out = [];
  for (const s of SERVER_STAGES) {
    const a = prev.stages?.[s]?.status, b = next.stages?.[s]?.status;
    if (b && a !== b) out.push({ type: "stage", data: { stage: s, status: b, ...(next.stages[s].engine ? { engine: next.stages[s].engine } : {}) } });
  }
  const pd = prev.discoveries || {}, nd = next.discoveries || {};
  const changed = Object.keys(nd).filter((k) => JSON.stringify(pd[k]) !== JSON.stringify(nd[k]));
  if (changed.length) out.push({ type: "discovery", data: Object.fromEntries(changed.map((k) => [k, nd[k]])) });
  const pp = prev.progress || {}, np = next.progress || {};
  if (pp.overallPct !== np.overallPct || pp.stagePct !== np.stagePct || pp.etaSec !== np.etaSec || pp.stage !== np.stage || pp.queuePosition !== np.queuePosition || prev.status !== next.status) {
    out.push({ type: "progress", data: { status: next.status, ...np } });
  }
  if ((prev.plan?.headRevision ?? null) !== (next.plan?.headRevision ?? null) && next.plan) out.push({ type: "plan", data: { headRevision: next.plan.headRevision, headHash: next.plan.headHash } });
  for (const r of next.renders || []) {
    const old = (prev.renders || []).find((x) => x.renderId === r.renderId);
    if (!old || old.status !== r.status || old.pct !== r.pct) out.push({ type: "render", data: r });
  }
  if (prev.status !== next.status && TERMINAL.has(next.status)) out.push({ type: "done", data: { status: next.status } });
  return out;
}

// watchEdit(id, { onSnapshot, onEvent, onNeedAuth, onNotFound, onTransport, onError, signal, timeoutMs })
//   → Promise<last ProjectView | null>, resolved on abort, timeout or not-found.
// onSnapshot(view) fires with every new merged view; onEvent({ type, data }) with every event
// (SSE, or synthesized from polling diffs). onNeedAuth(retry) on a real 401; call retry() after login.
export function watchEdit(id, {
  onSnapshot, onEvent, onNeedAuth, onNotFound, onTransport, onError, signal, timeoutMs = 0,
  pollMs = 1500, hiddenPollMs = 5000, sseSilenceMs = 10000, forcePoll = false,
} = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted || !EDIT_ID_RE.test(String(id))) { resolve(null); return; }
    const fixtureOn = isFixtureMode();
    let last = null;
    let lastSeq = -Infinity;
    let finished = false;
    let es = null;
    let pollTimer = null, silenceTimer = null, totalTimer = null;
    let sseErrors = 0;
    let gotMessage = false;
    let backoff = 1000;
    let pollsSinceFull = 0;
    let paused = false;
    let unsubscribeFixture = null;
    const hasDoc = typeof document !== "undefined";

    const safe = (fn, ...a) => { try { fn?.(...a); } catch { /* observers must not break the loop */ } };
    const deliver = (view) => { if (view && view !== last) { last = view; safe(onSnapshot, view); } };
    const apply = (type, data) => {
      if (Number.isInteger(data?.seq)) {
        if (data.seq <= lastSeq) return;
        lastSeq = data.seq;
      }
      if (type === "snapshot") deliver(omitSeq(data));
      else if (last) deliver(mergeEvent(last, type, data));
      safe(onEvent, { type, data: omitSeq(data), seq: data?.seq });
      if (type === "done" || type === "plan") refetchSoon();
    };

    const cleanup = () => {
      if (es) { es.close(); es = null; }
      clearTimeout(pollTimer); clearTimeout(silenceTimer); clearTimeout(totalTimer);
      if (hasDoc) document.removeEventListener("visibilitychange", onVisibility);
      if (unsubscribeFixture) unsubscribeFixture();
      signal?.removeEventListener("abort", finish);
    };
    function finish() {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(last);
    }
    signal?.addEventListener("abort", finish, { once: true });
    if (timeoutMs > 0) totalTimer = setTimeout(finish, timeoutMs);

    let refetchTimer = null;
    function refetchSoon() {
      clearTimeout(refetchTimer);
      refetchTimer = setTimeout(async () => {
        if (finished || paused) return;
        try { const full = await getEdit(id, { signal }); if (!finished) deliver(full); } catch (err) { handleError(err); }
      }, 150);
    }

    function needAuth() {
      paused = true;
      if (es) { es.close(); es = null; }
      clearTimeout(pollTimer);
      if (typeof onNeedAuth !== "function") { finish(); return; }
      safe(onNeedAuth, () => { if (finished) return; paused = false; start(); });
    }

    function handleError(err) {
      if (finished) return true;
      if (err?.name === "AbortError") { finish(); return true; }
      if (err?.status === 401) { needAuth(); return true; }
      if (err?.status === 404) { safe(onNotFound, err); finish(); return true; }
      safe(onError, err);
      return false;
    }

    function schedulePoll(ms) {
      clearTimeout(pollTimer);
      if (finished || paused) return;
      pollTimer = setTimeout(pollTick, ms);
    }

    async function pollTick() {
      if (finished || paused) return;
      try {
        if (!last || pollsSinceFull >= 20) {
          const full = await getEdit(id, { signal });
          if (finished) return;
          for (const e of diffViewEvents(last, full)) safe(onEvent, e);
          deliver(full);
          pollsSinceFull = 0;
        } else {
          const p = await getProgress(id, { signal });
          if (finished) return;
          const activeBefore = (last.renders || []).find((r) => r.status === "queued" || r.status === "running")?.renderId || null;
          const structural = p.status !== last.status || p.stage !== (last.progress?.stage ?? last.stage) || (p.planRevision != null && p.planRevision !== (last.plan?.headRevision ?? null)) || (p.activeRenderId ?? null) !== activeBefore;
          if (structural) {
            const full = await getEdit(id, { signal });
            if (finished) return;
            for (const e of diffViewEvents(last, full)) safe(onEvent, e);
            deliver(full);
            pollsSinceFull = 0;
          } else {
            const merged = mergeEvent(last, "progress", { status: p.status, stage: p.stage, stagePct: p.stagePct, overallPct: p.overallPct, etaSec: p.etaSec, queuePosition: p.queuePosition });
            if (p.activeRenderId) {
              const r = await getRender(id, p.activeRenderId, { signal });
              if (finished) return;
              const withRender = mergeEvent(merged, "render", r);
              for (const e of diffViewEvents(last, withRender)) safe(onEvent, e);
              deliver(withRender);
            } else {
              for (const e of diffViewEvents(last, merged)) safe(onEvent, e);
              deliver(merged);
            }
            pollsSinceFull++;
          }
        }
        backoff = 1000;
        const hidden = hasDoc && document.visibilityState === "hidden";
        schedulePoll(fixtureOn ? 450 : hidden ? hiddenPollMs : pollMs);
      } catch (err) {
        if (handleError(err)) return;
        const jittered = Math.round(backoff * (0.8 + Math.random() * 0.4));
        backoff = Math.min(30000, backoff * 2);
        schedulePoll(jittered);
      }
    }

    function startPoll(reason) {
      if (finished || paused) return;
      if (es) { es.close(); es = null; }
      clearTimeout(silenceTimer);
      safe(onTransport, fixtureOn ? "fixture" : "poll", reason);
      pollTick();
    }

    async function probeAfterSseError() {
      try { await getProgress(id, { signal }); return false; } catch (err) { return handleError(err); }
    }

    function startSse() {
      if (finished || paused) return;
      if (typeof EventSource === "undefined") { startPoll("no-eventsource"); return; }
      try {
        es = new EventSource(`${API_BASE}${ROOT}/${id}/events`, { withCredentials: true });
      } catch {
        startPoll("sse-unavailable");
        return;
      }
      safe(onTransport, "sse");
      gotMessage = false;
      sseErrors = 0;
      silenceTimer = setTimeout(() => { if (!gotMessage && !finished) startPoll("sse-silent"); }, sseSilenceMs);
      for (const type of SSE_TYPES) {
        es.addEventListener(type, (e) => {
          let data;
          try { data = JSON.parse(e.data); } catch { return; }
          gotMessage = true;
          sseErrors = 0;
          clearTimeout(silenceTimer);
          apply(type, data);
        });
      }
      es.onerror = async () => {
        sseErrors++;
        if (sseErrors < 2 && es && es.readyState !== 2) return;
        if (es) { es.close(); es = null; }
        if (await probeAfterSseError()) return;
        startPoll("sse-errors");
      };
    }

    function onVisibility() {
      if (!finished && !paused && !es && document.visibilityState === "visible") schedulePoll(0);
    }
    if (hasDoc) document.addEventListener("visibilitychange", onVisibility);

    function start() {
      if (fixtureOn) {
        if (!unsubscribeFixture) unsubscribeFixture = fixtureSubscribe(id, (type, data) => { if (!finished) apply(type, data); });
        startPoll("fixture");
      } else if (forcePoll) {
        startPoll("forced");
      } else {
        startSse();
      }
    }
    start();
  });
}

// ================================================================= FIXTURE MODE
const FIXTURE_FILES = import.meta.glob("../tests/fixtures/*.json", { import: "default" });
const fx = {
  data: null,
  loading: null,
  edits: new Map(),
  listeners: new Map(),
  clientRequests: new Map(),
  seq: 1,
  control: { conflictNext: false, failNext: null },
};

const winFlag = (name) => (typeof window !== "undefined" ? window[name] : undefined);
const clone = (o) => (o == null ? o : typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const speed = () => Math.max(0.05, Number(winFlag("__KF_AI_EDIT_FIXTURE_SPEED")) || 1);

function fxDelay(signal, min = 120, max = 380) {
  const fixed = Number(winFlag("__KF_AI_EDIT_FIXTURE_LATENCY"));
  const ms = Number.isFinite(fixed) && fixed >= 0 ? fixed : min + Math.random() * (max - min);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

async function fxLoad() {
  if (fx.data) return fx.data;
  if (!fx.loading) {
    fx.loading = (async () => {
      const get = async (name) => {
        const loader = FIXTURE_FILES[`../tests/fixtures/${name}.json`];
        if (!loader) throw new Error(`fixture ${name}.json missing`);
        return clone(await loader());
      };
      const [capabilities, list, ready, opsResponse, conflict, exportDone, ...rest] = await Promise.all([
        get("capabilities"), get("edits-list"), get("edit-ready"), get("ops-response"), get("conflict-409"), get("export-done"),
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => get(`edit-analyzing-0${n}`)),
        ...[1, 2, 3, 4].map((n) => get(`render-progress-0${n}`)),
      ]);
      fx.data = { capabilities, list, ready, opsResponse, conflict, exportDone, analyzing: rest.slice(0, 8), renderProgress: rest.slice(8) };
      return fx.data;
    })();
  }
  return fx.loading;
}

function fxEmit(id, type, data) {
  const set = fx.listeners.get(id);
  if (!set) return;
  const payload = { ...data, seq: 1e9 + fx.seq++ };
  for (const fn of [...set]) { try { fn(type, payload); } catch { /* listener */ } }
}

function fixtureSubscribe(id, fn) {
  if (!fx.listeners.has(id)) fx.listeners.set(id, new Set());
  fx.listeners.get(id).add(fn);
  return () => fx.listeners.get(id)?.delete(fn);
}

function fxFail(route, extra = {}) {
  const f = fx.control.failNext || winFlag("__KF_AI_EDIT_FIXTURE_FAIL");
  if (!f) return null;
  const spec = typeof f === "string" ? { route: f } : f;
  if (spec.route !== route && spec.route !== "*") return null;
  fx.control.failNext = null;
  if (typeof window !== "undefined" && window.__KF_AI_EDIT_FIXTURE_FAIL === f) window.__KF_AI_EDIT_FIXTURE_FAIL = null;
  const status = spec.status ?? 500;
  return new EditApiError(spec.body?.message || "Fixture failure", status, { error: status === 0 ? "NETWORK" : "INTERNAL", message: "Fixture failure", retryable: status === 0 || status >= 500, ...extra, ...(spec.body || {}) });
}

const STEP_MS = 1900;
const randomId = () => {
  const a = "0123456789abcdefghijklmnopqrstuvwxyz";
  let s = "ve_";
  for (let i = 0; i < 16; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
};

function planRecord(data) {
  const planResp = data.ready.plan;
  return { timeline: [{ plan: clone(planResp.plan), label: "Rename edit", author: "user", createdAt: planResp.createdAt, rev: planResp.revision }], pos: 0, head: planResp.revision };
}

function fxEdit(id) {
  const d = fx.data;
  if (fx.edits.has(id)) return fx.edits.get(id);
  let rec;
  if (id === d.ready.project.id) {
    rec = { id, kind: "ready", view: clone(d.ready.project), ...planRecord(d), renders: new Map(), searches: new Map() };
    for (const r of rec.view.renders || []) rec.renders.set(r.renderId, { ...r, startedAt: 0, done: true });
  } else if (id === d.analyzing[0].id) {
    rec = { id, kind: "analyzing", view: clone(d.analyzing[0]), startedAt: Date.now(), renders: new Map(), searches: new Map() };
  } else {
    const summary = d.list.projects.find((p) => p.id === id);
    if (!summary) return null;
    const base = clone(d.ready.project);
    const reason = d.list._fixture?.statusReasons?.[id] || null;
    const view = { ...base, ...summary, statusReason: reason, discoveries: summary.status === "COMPLETED" ? base.discoveries : {}, notices: [] };
    if (summary.status === "NEEDS_ATTENTION" || summary.status === "CANCELLED") {
      const idx = SERVER_STAGES.indexOf(summary.stage);
      view.stages = Object.fromEntries(SERVER_STAGES.map((s, i) => [s, { status: i < idx ? "done" : i === idx ? (summary.status === "CANCELLED" ? "interrupted" : "failed") : "pending", attempts: i <= idx ? 1 : 0, fallbacks: [] }]));
      view.plan = null; view.renders = []; view.qaSummary = null;
      view.progress = { stage: summary.stage, stagePct: 0, overallPct: summary.overallPct, message: reason?.message || "", etaSec: null, queuePosition: 0 };
      view.allowedActions = ["retry", "delete"];
      view.source = { ...base.source, displayName: `${summary.title}.mov`, durationSec: summary.durationSec };
      rec = { id, kind: "static", view, renders: new Map(), searches: new Map() };
    } else {
      rec = { id, kind: "ready", view, ...planRecord(d), renders: new Map(), searches: new Map() };
      if (summary.currentExportId) rec.renders.set(summary.currentExportId, { ...clone(d.exportDone.render), renderId: summary.currentExportId, planRevision: rec.head, startedAt: 0, done: true });
    }
  }
  fx.edits.set(id, rec);
  return rec;
}

// Advance an analyzing edit by wall time; flips to READY after the eighth step.
function fxTick(rec) {
  if (rec.kind !== "analyzing" || rec.deleted) return;
  if (rec.view.status === "CANCELLED") return;
  const d = fx.data;
  const step = Math.floor((Date.now() - rec.startedAt) / (STEP_MS / speed()));
  if (step >= d.analyzing.length) {
    const ready = clone(d.ready.project);
    Object.assign(rec, planRecord(d));
    rec.kind = "ready";
    rec.view = { ...ready, id: rec.id, title: rec.view.title, createdAt: rec.view.createdAt, source: { ...ready.source, displayName: rec.view.source.displayName, sizeBytes: rec.view.source.sizeBytes }, posterUrl: `${ROOT}/${rec.id}/media/poster`, updatedAt: Date.now() };
    rec.renders = new Map((ready.renders || []).map((r) => [r.renderId, { ...r, startedAt: 0, done: true }]));
    rec.timeline[0].plan.projectId = rec.id;
    return;
  }
  const frame = clone(d.analyzing[Math.max(0, step)]);
  rec.view = { ...frame, id: rec.id, title: rec.view.title, createdAt: rec.view.createdAt, source: { ...frame.source, displayName: rec.view.source.displayName, sizeBytes: rec.view.source.sizeBytes }, posterUrl: step >= 1 ? `${ROOT}/${rec.id}/media/poster` : null, updatedAt: Date.now() };
}

function renderState(rec, r) {
  const d = fx.data;
  if (r.done) return r;
  const total = (r.kind === "export" ? 6500 : 4200) / speed();
  const elapsed = Date.now() - r.startedAt;
  const k = Math.min(3, Math.floor((elapsed / total) * 4));
  const tpl = clone(d.renderProgress[k]);
  const out = { ...tpl, renderId: r.renderId, kind: r.kind, profile: r.profile, planRevision: r.planRevision, createdAt: r.startedAt };
  if (r.cancelled) return { ...out, status: "cancelled", pct: out.pct, etaSec: 0 };
  if (k === 3) {
    const doneRec = r.kind === "export"
      ? { ...clone(d.exportDone.render), renderId: r.renderId, planRevision: r.planRevision, profile: r.profile, createdAt: r.startedAt, finishedAt: Date.now() }
      : { ...out, compositionHash: `comp_r${r.planRevision}_fx`, durationSec: outDuration(rec.timeline?.[rec.pos]?.plan) || out.durationSec, finishedAt: Date.now() };
    if (r.kind === "export") {
      const previewSame = [...rec.renders.values()].some((x) => x.kind === "preview" && x.planRevision === r.planRevision && x.done);
      doneRec.compositionHash = `comp_r${r.planRevision}_fx`;
      doneRec.qa = { ...doneRec.qa, matchesPreview: { planRevision: r.planRevision, ok: previewSame }, checks: doneRec.qa.checks.map((c) => (c.id === "preview_match" ? { ...c, ok: previewSame, label: previewSame ? `Matches preview r${r.planRevision}` : `No preview of r${r.planRevision} to compare`, detail: previewSame ? "same composition" : "update the preview to compare" } : c)) };
    }
    Object.assign(r, doneRec, { done: true });
    fxEmit(rec.id, "render", doneRec);
    return r;
  }
  return out;
}

function fxView(rec) {
  fxTick(rec);
  const renders = [...rec.renders.values()].map((r) => stripInternal(renderState(rec, r)));
  const view = { ...rec.view, renders };
  if (rec.kind === "ready") {
    const h = { headRevision: rec.head, headHash: `ph${rec.head}_fx`, canUndo: rec.pos > 0 || rec.head > 1, canRedo: rec.pos < rec.timeline.length - 1 };
    view.plan = h;
    const exportsDone = renders.filter((r) => r.kind === "export" && r.status === "done");
    const latest = exportsDone.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))[0];
    view.exports = { currentId: latest?.renderId || view.currentExportId || null, stale: latest ? latest.planRevision < rec.head : false };
    view.currentExportId = view.exports.currentId;
    const active = renders.some((r) => r.status === "queued" || r.status === "running");
    if (view.status !== "CANCELLED") view.status = active ? "RENDERING" : latest && view.status !== "READY" ? "COMPLETED" : view.status === "RENDERING" ? "READY" : view.status;
    view.outputDurationSec = outDuration(rec.timeline[rec.pos].plan);
  }
  return view;
}

const fxSummary = (v) => ({ id: v.id, title: v.title, status: v.status, stage: v.stage, overallPct: v.overallPct, createdAt: v.createdAt, updatedAt: v.updatedAt, lastOpenedAt: v.lastOpenedAt, durationSec: v.durationSec, outputDurationSec: v.outputDurationSec, orientation: v.orientation, posterUrl: v.posterUrl, currentExportId: v.currentExportId, qaVerdict: v.qaVerdict });

function fxRequire(id, { ready = false } = {}) {
  const rec = EDIT_ID_RE.test(String(id)) ? fxEdit(id) : null;
  if (!rec || rec.deleted) throw new EditApiError("Not found.", 404, { error: "NOT_FOUND", message: "Not found.", retryable: false });
  fxTick(rec);
  if (ready && rec.kind !== "ready") throw new EditApiError("Not ready yet.", 409, { error: "NOT_READY", message: "Not ready yet.", retryable: true });
  return rec;
}

const curPlan = (rec) => rec.timeline[rec.pos].plan;
const words = () => fx.data.ready.transcript.words;

// Apply ops the way the server would (including the non-optimistic ones) to a fixture plan.
function fxApplyOps(rec, ops) {
  let plan = clone(curPlan(rec));
  const warnings = [];
  let level = "NONE";
  let ranges = [];
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index];
    const v = validateOp(op, plan, { words: words() });
    if (!v.ok) throw new EditApiError(v.reason, 422, { error: "INVALID_OP", message: v.reason, details: { index, reason: v.reason }, retryable: false });
    const est = dirtyEstimate(op, plan);
    level = maxLevel(level, est.level);
    ranges = ranges.concat(est.ranges);
    const local = applyOpLocal(plan, op, { words: words() });
    if (!local.ok) throw new EditApiError(local.reason, 422, { error: "INVALID_OP", message: local.reason, details: { index, reason: local.reason }, retryable: false });
    plan = local.plan;
    if (!local.skipped) continue;
    switch (op.type) {
      case "broll.replace": {
        const item = findItem(plan, "broll", op.id);
        const pool = [...(item.topCandidates || []), ...(rec.searches.get(op.id) || [])];
        const chosen = pool.find((c) => c.assetId === op.candidateId || c.assetId === op.assetId);
        if (!chosen) throw new EditApiError("That clip isn't in this slot's results.", 422, { error: "INVALID_OP", message: "That clip isn't in this slot's results.", details: { index, reason: "candidate" } });
        plan = { ...plan, broll: plan.broll.map((b) => (b.id === op.id ? { ...b, chosen, status: "ok", userModified: true, topCandidates: b.topCandidates?.some((c) => c.assetId === chosen.assetId) ? b.topCandidates : [...(b.topCandidates || []), chosen] } : b)) };
        break;
      }
      case "broll.regenerate": {
        const item = findItem(plan, "broll", op.id);
        const pool = [...(item.topCandidates || []), ...(rec.searches.get(op.id) || [])].filter((c) => c.assetId !== item.chosen?.assetId);
        if (pool[0]) plan = { ...plan, broll: plan.broll.map((b) => (b.id === op.id ? { ...b, chosen: pool[0], status: "ok", userModified: true, queries: op.query ? [{ text: op.query, kind: "user" }] : b.queries } : b)) };
        else warnings.push({ code: "NO_BROLL_FOUND", message: "Nothing new fit this line." });
        break;
      }
      case "music.change": {
        const cand = (plan.music?.candidates || []).find((c) => c.assetId === op.candidateId);
        if (cand) plan = { ...plan, music: { ...plan.music, enabled: true, track: { ...plan.music.track, ...cand }, candidates: [plan.music.track, ...plan.music.candidates.filter((c) => c.assetId !== cand.assetId)].slice(0, 3) } };
        else plan = { ...plan, music: { ...plan.music, track: { ...plan.music.track, mood: op.mood || plan.music.track.mood, query: op.query || plan.music.track.query, title: `${op.mood || op.query || "New"} bed` } } };
        break;
      }
      case "settings.set":
        plan = { ...plan, settings: { ...plan.settings, [op.key]: op.value } };
        if (op.key === "brollIntensity" || op.key === "effects") warnings.push({ code: "REPLANNED", added: op.value === "high" ? 2 : 0, removed: op.value === "low" ? 1 : 0, keptUserChanges: plan.broll.filter((b) => b.userModified || b.locked).length });
        break;
      case "output.setAspect": {
        const dims = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080] }[op.aspect];
        plan = { ...plan, output: { ...plan.output, aspect: op.aspect, width: dims[0], height: dims[1] } };
        ranges = [[0, outDuration(plan)]];
        break;
      }
      case "captions.setLanguage":
        plan = { ...plan, captions: { ...plan.captions, language: op.language === "auto" ? plan.captions.sourceLanguage : op.language }, settings: { ...plan.settings, captionLanguage: op.language } };
        break;
      case "branding.setLogo":
        plan = { ...plan, branding: { ...plan.branding, logo: { assetId: op.assetId, path: "brand/logo.png", placement: plan.branding.logo?.placement || "tr", scale: plan.branding.logo?.scale || 0.12, opacity: plan.branding.logo?.opacity || 0.85, marginPct: 0.04, show: "always" } } };
        break;
      case "cut.add": {
        const a = Number.isInteger(op.w0) ? words()[op.w0] : null, z = Number.isInteger(op.w1) ? words()[op.w1] : null;
        const srcIn = a ? a.start - 0.03 : op.srcIn, srcOut = z ? z.end + 0.05 : op.srcOut;
        plan = resolvePlanLocal({ ...plan, cuts: [...plan.cuts, { id: `cut_user${String(plan.cuts.length + 1).padStart(3, "0")}`, kind: "USER", srcIn, srcOut, raw: { srcIn, srcOut }, snap: { method: "word_edge", padIn: 0.03, padOut: 0.05 }, wordRange: a && z ? [op.w0, op.w1] : null, confidence: 1, controlledBy: null, enabled: true, userToggled: true, reason: "Cut by you.", origin: "user", locked: false }].sort((x, y) => x.srcIn - y.srcIn) }, { words: words() });
        break;
      }
      case "broll.add": {
        const sen = fx.data.ready.transcript.sentences.find((s) => s.id === op.sentenceId);
        if (!sen) throw new EditApiError("That line isn't in the transcript.", 422, { error: "INVALID_OP", message: "That line isn't in the transcript.", details: { index } });
        const ordinal = Math.max(0, ...plan.broll.map((b) => b.ordinal)) + 1;
        const w1 = Math.min(sen.w1, sen.w0 + 5);
        plan = resolvePlanLocal({ ...plan, broll: [...plan.broll, { id: `br_user${String(ordinal).padStart(3, "0")}`, ordinal, anchor: { kind: "words", w0: sen.w0, w1 }, resolved: null, sentenceId: sen.id, segmentId: sen.segmentId, layout: op.layout || "FULL", layoutParams: {}, intent: "illustrate", queries: [], reason: "Added by you.", reasonCode: "USER", evidence: { sentenceId: sen.id, wordRange: [sen.w0, w1] }, chosen: null, candidateSetId: null, topCandidates: [], judge: "unavailable", status: "pending", origin: "user", locked: false, userModified: true }] }, { words: words() });
        break;
      }
      default:
        break;
    }
  }
  return { plan, warnings, invalidates: { level, ranges: mergeRanges(ranges) } };
}

function fxCommit(rec, plan, label) {
  rec.timeline = rec.timeline.slice(0, rec.pos + 1);
  rec.head += 1;
  rec.timeline.push({ plan: { ...plan, revision: rec.head, parentRevision: rec.head - 1 }, label, author: "user", createdAt: Date.now(), rev: rec.head });
  rec.pos = rec.timeline.length - 1;
  rec.view.updatedAt = Date.now();
  fxEmit(rec.id, "plan", { headRevision: rec.head, headHash: `ph${rec.head}_fx`, author: "user" });
}

function fxCandidateView(rec, c, chosenId) {
  return {
    id: c.assetId, provider: c.provider, type: c.type || "video", durationSec: c.durationSec, w: c.width, h: c.height,
    thumbUrl: fixtureMedia(rec.id, "broll-thumb", c.assetId), previewUrl: null,
    score: { total: c.scores?.total ?? 0.6, lexical: c.scores?.lexical ?? 0.5, judgeRelevance: c.scores?.judgeRelevance ?? null, quality: c.scores?.judgeQuality ?? null, fit: c.scores?.aspect ?? 1 },
    issues: c.scores?.issues || [], license: c.license, attribution: c.attribution, used: c.assetId === chosenId,
  };
}

const FIXTURE_ROUTES = {
  async getCapabilities([opts = {}]) {
    await fxDelay(opts.signal, 60, 160);
    return clone(fx.data.capabilities);
  },
  async listEdits([opts = {}]) {
    await fxDelay(opts.signal);
    const known = new Set();
    const projects = [];
    for (const rec of fx.edits.values()) {
      if (rec.deleted) { known.add(rec.id); continue; }
      projects.push(fxSummary(fxView(rec)));
      known.add(rec.id);
    }
    for (const p of fx.data.list.projects) if (!known.has(p.id)) projects.push(fxSummary(fxView(fxEdit(p.id))));
    const filtered = opts.status ? projects.filter((p) => p.status === opts.status) : projects;
    return { projects: filtered.sort((a, b) => b.createdAt - a.createdAt), nextCursor: null };
  },
  async getEdit([id, opts = {}]) {
    await fxDelay(opts.signal);
    const rec = fxRequire(id);
    rec.view.lastOpenedAt = Date.now();
    return fxView(rec);
  },
  async getProgress([id, opts = {}]) {
    await fxDelay(opts.signal, 40, 120);
    const v = fxView(fxRequire(id));
    const active = (v.renders || []).find((r) => r.status === "queued" || r.status === "running");
    return { status: v.status, stage: v.progress?.stage ?? v.stage, stagePct: v.progress?.stagePct ?? 0, overallPct: v.overallPct, etaSec: v.progress?.etaSec ?? null, queuePosition: v.progress?.queuePosition ?? 0, planRevision: v.plan?.headRevision ?? null, activeRenderId: active?.renderId || null, updatedAt: v.updatedAt };
  },
  async getPlan([id, opts = {}]) {
    await fxDelay(opts.signal);
    const rec = fxRequire(id, { ready: true });
    const entry = opts.rev != null ? rec.timeline.find((t) => t.rev === Number(opts.rev)) : null;
    if (opts.rev != null && !entry) throw new EditApiError("Not found.", 404, { error: "NOT_FOUND", message: "No such revision." });
    const plan = entry ? entry.plan : curPlan(rec);
    return { revision: entry ? entry.rev : rec.head, hash: `ph${entry ? entry.rev : rec.head}_fx`, author: (entry || rec.timeline[rec.pos]).author, createdAt: (entry || rec.timeline[rec.pos]).createdAt, plan: clone({ ...plan, projectId: rec.id, revision: entry ? entry.rev : rec.head }) };
  },
  async getRevisions([id, opts = {}]) {
    await fxDelay(opts.signal);
    const rec = fxRequire(id, { ready: true });
    return {
      head: rec.head,
      revisions: rec.timeline.map((t, i) => ({ rev: t.rev, hash: `ph${t.rev}_fx`, parent: i ? rec.timeline[i - 1].rev : null, author: t.author, opsCount: 1, summary: t.label, createdAt: t.createdAt })),
      canUndo: rec.pos > 0, canRedo: rec.pos < rec.timeline.length - 1,
      undoLabel: rec.pos > 0 ? rec.timeline[rec.pos].label : null, redoLabel: rec.timeline[rec.pos + 1]?.label || null,
    };
  },
  async getTranscript([id, opts = {}]) {
    await fxDelay(opts.signal);
    fxRequire(id, { ready: true });
    return clone(fx.data.ready.transcript);
  },
  async applyOps([id, body, opts = {}]) {
    await fxDelay(opts.signal, 180, 420);
    const failure = fxFail("ops");
    if (failure) throw failure;
    const rec = fxRequire(id, { ready: true });
    const conflictFlag = fx.control.conflictNext || winFlag("__KF_AI_EDIT_FIXTURE_CONFLICT_NEXT");
    if (conflictFlag) {
      fx.control.conflictNext = false;
      if (typeof window !== "undefined") window.__KF_AI_EDIT_FIXTURE_CONFLICT_NEXT = false;
      const other = fx.data.conflict._fixture?.otherTabOps || [];
      try {
        const r = fxApplyOps(rec, other);
        fxCommit(rec, r.plan, fx.data.conflict._fixture?.otherTabLabel || "Change in another tab");
      } catch {
        // The other tab's change is already in this plan: it still saved a revision, so conflict anyway.
        fxCommit(rec, clone(curPlan(rec)), "Change in another tab");
      }
    }
    if (body.expectedRevision !== rec.head) {
      const b = clone(fx.data.conflict.body);
      b.details = { headRevision: rec.head };
      throw new EditApiError(b.message, 409, b);
    }
    const r = fxApplyOps(rec, body.ops || []);
    fxCommit(rec, r.plan, opLabel(body.ops?.[0], curPlan(rec)));
    return { ...clone(fx.data.opsResponse), revision: rec.head, hash: `ph${rec.head}_fx`, applied: (body.ops || []).length, warnings: r.warnings, invalidates: r.invalidates };
  },
  async undo([id, body, opts = {}]) { return fxHistory(id, body, opts, -1); },
  async redo([id, body, opts = {}]) { return fxHistory(id, body, opts, 1); },
  async updateSettings([id, body, opts = {}]) {
    await fxDelay(opts.signal);
    const rec = fxRequire(id);
    const s = body.settings || {};
    const reanalyze = (s.language && s.language !== "auto") || s.privacy;
    if (reanalyze && !body.confirmReanalyze) throw new EditApiError("This change needs the take analyzed again.", 409, { error: "REANALYZE_REQUIRED", message: "This change needs the take analyzed again.", details: { estimate: { sec: 95, usdLow: 0.01, usdHigh: 0.03 } }, retryable: false });
    if (reanalyze) {
      rec.kind = "analyzing";
      rec.startedAt = Date.now() - 3 * (STEP_MS / speed());
      return { requeuedFrom: "TRANSCRIBING", estimate: { sec: 95, usdLow: 0.01, usdHigh: 0.03 } };
    }
    const ops = [];
    if (s.captions?.styleId || s.captions?.maxWordsPerLine) ops.push({ type: "captions.setStyle", styleId: s.captions.styleId || curPlan(rec).captions.styleId, ...(s.captions.maxWordsPerLine ? { maxWordsPerLine: s.captions.maxWordsPerLine } : {}) });
    if (s.broll?.intensity) ops.push({ type: "settings.set", key: "brollIntensity", value: s.broll.intensity });
    if (s.effects?.intensity) ops.push({ type: "settings.set", key: "effects", value: s.effects.intensity });
    if (!ops.length) return { revision: rec.head, hash: `ph${rec.head}_fx`, applied: 0, warnings: [], invalidates: { level: "NONE", ranges: [] } };
    const r = fxApplyOps(rec, ops);
    fxCommit(rec, r.plan, "Change settings");
    return { revision: rec.head, hash: `ph${rec.head}_fx`, applied: ops.length, warnings: r.warnings, invalidates: r.invalidates };
  },
  async getCandidates([id, opts = {}]) {
    await fxDelay(opts.signal);
    const rec = fxRequire(id, { ready: true });
    const plan = curPlan(rec);
    if (opts.itemId === "music") {
      return { candidates: (plan.music?.candidates || []).map((c) => ({ id: c.assetId, provider: c.provider, type: "audio", durationSec: c.durationSec, title: c.title, mood: c.mood, previewUrl: null, license: c.license, attribution: null, used: false, score: { total: 0.7 } })) };
    }
    const item = findItem(plan, "broll", opts.itemId);
    if (!item) throw new EditApiError("Not found.", 404, { error: "NOT_FOUND", message: "Not found." });
    const pool = [...(item.topCandidates || []), ...(rec.searches.get(item.id) || [])].slice(0, Math.min(20, opts.limit || 20));
    return { candidates: pool.map((c) => fxCandidateView(rec, c, item.chosen?.assetId)) };
  },
  async searchCandidates([id, body, opts = {}]) {
    await fxDelay(opts.signal);
    const failure = fxFail("search");
    if (failure) throw failure;
    const rec = fxRequire(id, { ready: true });
    const q = String(body.query || "").trim();
    if (q.length < 2 || q.length > 80) throw new EditApiError("Search terms must be 2–80 characters.", 422, { error: "VALIDATION_FAILED", message: "Search terms must be 2–80 characters." });
    const searchId = `srch_${Math.random().toString(36).slice(2, 10)}`;
    setTimeout(() => {
      const n = (rec.searches.get(body.itemId) || []).length;
      const found = [0, 1, 2].map((k) => ({
        assetId: `ast_fxs${String(n + k + 1).padStart(3, "0")}`, provider: k % 2 ? "pixabay" : "pexels", providerId: String(5200000 + n + k), type: "video",
        width: k === 1 ? 1080 : 1920, height: k === 1 ? 1920 : 1080, durationSec: 6 + k * 2.5, license: k % 2 ? "Pixabay Content License" : "Pexels License",
        attribution: k % 2 ? null : "Video from Pexels", tags: q.split(/\s+/), scores: { lexical: 0.8 - k * 0.1, judgeRelevance: 8 - k, judgeQuality: 8, issues: [], aspect: k === 1 ? 1 : 0.6, total: 0.78 - k * 0.08 },
      }));
      rec.searches.set(body.itemId, [...(rec.searches.get(body.itemId) || []), ...found]);
      const item = findItem(curPlan(rec), "broll", body.itemId);
      fxEmit(rec.id, "candidates", { itemId: body.itemId, searchId, candidates: found.map((c) => fxCandidateView(rec, c, item?.chosen?.assetId)) });
    }, 1400 / speed());
    return { searchId };
  },
  async requestRender([id, body, opts = {}]) {
    await fxDelay(opts.signal);
    const failure = fxFail("render");
    if (failure) throw failure;
    const rec = fxRequire(id, { ready: true });
    const planRevision = Number.isInteger(body.planRevision) ? body.planRevision : rec.head;
    if (planRevision > rec.head) throw new EditApiError("The edit changed.", 409, { error: "REVISION_CONFLICT", message: "The edit changed.", details: { headRevision: rec.head } });
    const kind = body.kind === "export" ? "export" : "preview";
    const profile = body.profile || (kind === "export" ? "export1080" : "preview540");
    const cached = [...rec.renders.values()].find((r) => r.kind === kind && r.planRevision === planRevision && r.profile === profile && r.done);
    if (cached) return { renderId: cached.renderId, cached: true };
    for (const r of rec.renders.values()) if (r.kind === kind && !r.done) r.cancelled = true;
    const renderId = `rd_${kind === "export" ? "exp" : "prev"}${String(planRevision).padStart(4, "0")}${Math.random().toString(36).slice(2, 5)}`;
    rec.renders.set(renderId, { renderId, kind, profile, planRevision, startedAt: Date.now(), done: false });
    return { renderId, queuePosition: 0 };
  },
  async getRender([id, renderId, opts = {}]) {
    await fxDelay(opts.signal, 40, 120);
    const rec = fxRequire(id);
    const r = rec.renders.get(renderId);
    if (!r) throw new EditApiError("Not found.", 404, { error: "NOT_FOUND", message: "Not found." });
    return stripInternal(renderState(rec, r));
  },
  async getExports([id, opts = {}]) {
    await fxDelay(opts.signal);
    const rec = fxRequire(id);
    const done = [...rec.renders.values()].map((r) => renderState(rec, r)).filter((r) => r.kind === "export" && r.done).sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
    const tpl = fx.data.exportDone.exports.items[0];
    const slug = String(rec.view.title || "edit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "edit";
    return {
      currentId: done[0]?.renderId || null,
      stale: done[0] ? done[0].planRevision < (rec.head || 0) : false,
      items: done.map((r) => ({
        renderId: r.renderId, planRev: r.planRevision, profile: r.profile, createdAt: r.createdAt, qa: { verdict: r.qa?.verdict || "pass", score: r.qa?.score ?? 9 }, checks: r.qa?.checks || [], credits: r.credits || [], usage: r.usage || null,
        files: Object.fromEntries(Object.entries(tpl.files).map(([k, f]) => [k, { ...f, key: k === "srt" ? `${r.renderId}.srt` : k === "vtt" ? `${r.renderId}.vtt` : r.renderId, filename: f.filename.replace("take-03-pricing-story", slug) }])),
      })),
    };
  },
  async cancelEdit([id, body = {}, opts = {}]) {
    await fxDelay(opts.signal);
    const rec = fxRequire(id);
    if (body.target === "render") {
      const r = body.renderId ? rec.renders.get(body.renderId) : [...rec.renders.values()].find((x) => !x.done);
      if (!r || r.done) throw new EditApiError("Nothing is running.", 409, { error: "NOTHING_TO_CANCEL", message: "Nothing is running." });
      r.cancelled = true; r.done = true; r.status = "cancelled";
      return { cancelling: true };
    }
    if (rec.kind !== "analyzing" || rec.view.status === "CANCELLED") throw new EditApiError("Nothing is running.", 409, { error: "NOTHING_TO_CANCEL", message: "Nothing is running." });
    fxTick(rec);
    rec.cancelledAtStep = Math.floor((Date.now() - rec.startedAt) / (STEP_MS / speed()));
    rec.view = { ...rec.view, status: "CANCELLED", statusReason: { code: "CANCELLED", message: "Stopped by you.", retryable: true, stage: rec.view.progress?.stage, actions: ["retry", "delete"] }, allowedActions: ["retry", "delete"], updatedAt: Date.now() };
    setTimeout(() => fxEmit(rec.id, "done", { status: "CANCELLED" }), 200);
    return { cancelling: true };
  },
  async retryEdit([id, body = {}, opts = {}]) {
    await fxDelay(opts.signal);
    const rec = fxRequire(id);
    if (!["NEEDS_ATTENTION", "FAILED", "CANCELLED"].includes(rec.view.status)) throw new EditApiError("That action is not possible in the project's current state.", 409, { error: "ILLEGAL_TRANSITION", message: "That action is not possible in the project's current state." });
    const fromStep = rec.cancelledAtStep ?? Math.max(0, SERVER_STAGES.indexOf(rec.view.progress?.stage) >= 3 ? 2 : 1);
    rec.kind = "analyzing";
    rec.startedAt = Date.now() - fromStep * (STEP_MS / speed());
    rec.cancelledAtStep = null;
    rec.view = { ...rec.view, status: "PROCESSING", statusReason: null };
    return { fromStage: rec.view.progress?.stage || "VALIDATING", continueWithout: body.continueWithout || null };
  },
  async deleteEdit([id, opts = {}]) {
    await fxDelay(opts.signal);
    const rec = fxRequire(id);
    rec.deleted = true;
    return { deleting: true };
  },
  async uploadLogo([id, file, opts = {}]) {
    await fxDelay(opts.signal, 400, 900);
    const rec = fxRequire(id, { ready: true });
    if (file && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new EditApiError("Logos must be PNG, JPG or WEBP.", 415, { error: "UNSUPPORTED_MEDIA", message: "Logos must be PNG, JPG or WEBP." });
    if (file && file.size > 5 * 1024 * 1024) throw new EditApiError("Logos can be up to 5 MB.", 422, { error: "VALIDATION_FAILED", message: "Logos can be up to 5 MB." });
    const r = fxApplyOps(rec, [{ type: "branding.setLogo", assetId: "ast_logofx1" }]);
    fxCommit(rec, r.plan, "Set logo");
    return { revision: rec.head };
  },
  async getPlaybackTokens([id, items = [], opts = {}]) {
    await fxDelay(opts.signal, 40, 100);
    fxRequire(id);
    return { urls: items.map((it) => ({ kind: it.kind, key: it.key ?? null, url: fixtureMedia(id, it.kind, it.key) })), expiresAt: Date.now() + 15 * 60e3 };
  },
};

async function fxHistory(id, body, opts, dir) {
  await fxDelay(opts.signal);
  const rec = fxRequire(id, { ready: true });
  if (body?.expectedRevision !== rec.head) {
    const b = clone(fx.data.conflict.body);
    b.details = { headRevision: rec.head };
    throw new EditApiError(b.message, 409, b);
  }
  const target = rec.pos + dir;
  if (target < 0 || target >= rec.timeline.length) throw new EditApiError(dir < 0 ? "Nothing to undo." : "Nothing to redo.", 409, { error: "ILLEGAL_TRANSITION", message: dir < 0 ? "Nothing to undo." : "Nothing to redo." });
  const before = curPlan(rec);
  rec.pos = target;
  rec.head += 1;
  rec.timeline[rec.pos] = { ...rec.timeline[rec.pos], plan: { ...rec.timeline[rec.pos].plan, revision: rec.head } };
  rec.view.updatedAt = Date.now();
  fxEmit(rec.id, "plan", { headRevision: rec.head, headHash: `ph${rec.head}_fx`, author: "user" });
  const dur = Math.max(outDuration(before), outDuration(curPlan(rec)));
  return { revision: rec.head, hash: `ph${rec.head}_fx`, applied: 0, warnings: [], invalidates: { level: "COMPOSITE", ranges: [[0, dur]] } };
}

async function fixture(name, args) {
  await fxLoad();
  const handler = FIXTURE_ROUTES[name];
  if (!handler) throw new EditApiError(`Fixture route ${name} missing`, 500, { error: "INTERNAL" });
  if (name !== "getCapabilities" && args[0] !== undefined && typeof args[0] === "string") {
    const failure = fxFail(name);
    if (failure) throw failure;
  }
  return handler(args);
}

async function fixtureUpload(file, { settings, clientRequestId }, { onProgress, onPhase, signal }) {
  await fxLoad();
  if (clientRequestId && fx.clientRequests.has(clientRequestId)) {
    const rec = fxEdit(fx.clientRequests.get(clientRequestId));
    return { project: fxView(rec), costEstimate: { usdLow: 0.02, usdHigh: 0.05 }, replayed: true };
  }
  const total = Math.max(1, Number(file?.size) || 1);
  const durationMs = Math.min(6500, Math.max(2600, total / (38 * 1024 * 1024) * 1000)) / speed();
  const failAt = winFlag("__KF_AI_EDIT_FIXTURE_FAIL") === "upload-offline" ? 0.42 : null;
  const meter = createRateMeter();
  try { onPhase?.("uploading"); } catch { /* observer */ }
  const t0 = Date.now();
  await new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const timer = setInterval(() => {
      const frac = Math.min(1, (Date.now() - t0) / durationMs);
      if (failAt != null && frac >= failAt) {
        clearInterval(timer);
        if (typeof window !== "undefined") window.__KF_AI_EDIT_FIXTURE_FAIL = null;
        reject(new EditApiError("Upload stopped — the connection dropped.", 0, { error: "NETWORK", retryable: true, offline: true }));
        return;
      }
      try { onProgress?.(meter.sample(Math.round(total * frac), total)); } catch { /* observer */ }
      if (frac >= 1) { clearInterval(timer); resolve(); }
    }, 120);
    signal?.addEventListener("abort", () => { clearInterval(timer); reject(abortError()); }, { once: true });
  });
  try { onPhase?.("verifying"); } catch { /* observer */ }
  await fxDelay(signal, 650, 1000);
  const id = randomId();
  const base = clone(fx.data.analyzing[0]);
  const title = (settings?.title || String(file?.name || "take").replace(/\.[^.]+$/, "")).slice(0, 120);
  const rec = {
    id, kind: "analyzing", startedAt: Date.now(), renders: new Map(), searches: new Map(),
    view: { ...base, id, title, createdAt: Date.now(), updatedAt: Date.now(), lastOpenedAt: Date.now(), source: { ...base.source, displayName: file?.name || "take.mp4", sizeBytes: total }, settings: { ...base.settings, ...settings, title } },
  };
  fx.edits.set(id, rec);
  if (clientRequestId) fx.clientRequests.set(clientRequestId, id);
  return { project: fxView(rec), costEstimate: { usdLow: 0.02, usdHigh: 0.05 }, replayed: false };
}

// Placeholder media for fixture mode: posters/thumbnails as film-set SVGs, captions as SRT/VTT
// built from the loaded plan, video from window.__KF_AI_EDIT_FIXTURE_VIDEO when provided.
const FRAME_GRADS = [["#e832a8", "#6b1050", "#2a0a20"], ["#23c8e0", "#10505c", "#081f24"], ["#ffb03a", "#8a4d0e", "#2e1a05"]];
function hashIdx(s, n) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % n;
}
function svgPoster(label, seed, { w = 540, h = 960 } = {}) {
  const [a, b, c] = FRAME_GRADS[hashIdx(seed, FRAME_GRADS.length)];
  const cx = w / 2, headR = Math.round(Math.min(w, h) * 0.2);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='.55' stop-color='${b}'/><stop offset='1' stop-color='${c}'/></linearGradient></defs><rect width='${w}' height='${h}' fill='url(#g)'/><circle cx='${cx}' cy='${Math.round(h * 0.4)}' r='${headR}' fill='#f2ede2' opacity='.16'/><rect x='${Math.round(cx - headR * 1.9)}' y='${Math.round(h * 0.4 + headR * 1.25)}' width='${Math.round(headR * 3.8)}' height='${h}' rx='${headR * 1.6}' fill='#f2ede2' opacity='.12'/><text x='${cx}' y='${h - 36}' font-family='IBM Plex Mono, monospace' font-size='${Math.round(Math.min(w, h) / 26)}' letter-spacing='5' fill='#f2ede2' opacity='.78' text-anchor='middle'>${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
const srtTime = (t, sep = ",") => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${sep}${String(ms % 1000).padStart(3, "0")}`;
};
function fixtureMedia(editId, kind, key, { download = false } = {}) {
  const rec = fx.data ? fx.edits.get(editId) : null;
  const plan = rec?.timeline ? curPlan(rec) : fx.data?.ready?.plan?.plan;
  const horizontal = rec?.view?.orientation === "horizontal";
  const dims = horizontal ? { w: 960, h: 540 } : rec?.view?.orientation === "square" ? { w: 720, h: 720 } : { w: 540, h: 960 };
  switch (kind) {
    case "poster": return svgPoster("FIXTURE · POSTER", editId, dims);
    case "thumbs": return svgPoster(`FRAME ${key ?? 0}`, `${editId}${key}`, dims);
    case "broll-thumb": return svgPoster("B-ROLL", key || editId, { w: 480, h: 270 });
    case "card-preview": return svgPoster("CARD", key || editId, { w: 540, h: 280 });
    case "logo": return svgPoster("LOGO", "logo", { w: 256, h: 256 });
    case "captions": {
      const vtt = String(key || "").endsWith(".vtt");
      const cues = (plan?.captions?.cues || []).filter((c) => !c.hidden && !c.resolved?.collapsed);
      const body = cues.map((c, i) => `${vtt ? "" : `${i + 1}\n`}${srtTime(c.resolved.outIn, vtt ? "." : ",")} --> ${srtTime(c.resolved.outOut, vtt ? "." : ",")}\n${(c.lines && c.lines.length ? c.lines : [c.text]).join("\n")}\n`).join("\n");
      return `data:text/${vtt ? "vtt" : "plain"};charset=utf-8,${encodeURIComponent(vtt ? `WEBVTT\n\n${body}` : body)}`;
    }
    case "credits": return `data:text/plain;charset=utf-8,${encodeURIComponent("KEYFRAME fixture credits\nVideo by Mikhail Nilov from Pexels\n“Morning Drive” — Pixabay\n")}`;
    case "preview": case "export": case "source-proxy": case "broll-preview": {
      const v = winFlag("__KF_AI_EDIT_FIXTURE_VIDEO");
      return typeof v === "string" && v ? v : download ? null : null;
    }
    default: return null;
  }
}

// Test/smoke hooks for fixture mode (no effect on real requests).
export const fixtureControl = Object.freeze({
  enabled: isFixtureMode,
  conflictNext() { fx.control.conflictNext = true; },
  failNext(routeName, status = 500, body = null) { fx.control.failNext = { route: routeName, status, body }; },
  reset() { fx.edits.clear(); fx.listeners.clear(); fx.clientRequests.clear(); fx.control.conflictNext = false; fx.control.failNext = null; },
  load: fxLoad,
});
