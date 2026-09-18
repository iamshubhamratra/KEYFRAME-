// UPLOAD STORE — the one upload in flight, as a module singleton that outlives any screen.
//
// A person can start an upload and wander to My edits or the Gallery; the bytes keep flowing and
// the nav chip keeps counting (AI EDIT · 42%). So the upload lives here, not in a component.
// State machine (UX.md §1b):
//   idle → checking → rejected | ready → uploading → verifying → started
//                                  ↘ failed | cancelled (a failed/cancelled upload may start again)
// Every client-side check runs before any network request and yields the exact UX copy. A
// beforeunload guard is installed only while bytes are in flight.

import { useSyncExternalStore } from "react";
import { uploadEditVideo, newClientRequestId } from "./editApi.js";
import { UPLOAD_COPY, fmtBytes, fmtDuration, shortEdgeLabel, aspectOf, CONSENT_TERMS_VERSION, errorCopy } from "./editFormat.js";
import { pushRecent } from "./recentEdits.js";

export const DEFAULT_LIMITS = Object.freeze({
  maxUploadMb: 500,
  minDurationSec: 3,
  maxDurationSec: 300,
  warnShortEdgePx: 480,
  acceptedTypes: Object.freeze(["video/mp4", "video/quicktime", "video/webm"]),
  acceptedExtensions: Object.freeze([".mp4", ".mov", ".webm", ".m4v"]),
});
export const METADATA_TIMEOUT_MS = 8000;

const IDLE = Object.freeze({
  phase: "idle",
  file: null,        // { name, size, type, ext, lastModified }
  meta: null,        // { durationSec, width, height, aspect, posterUrl, previewable }
  issues: [],        // [{ code, blocking, message }] — message may contain **strong** markers
  progress: null,    // { loaded, total, pct, rateBps, etaSec }
  error: null,       // { status, code, title, message, needAuth }
  projectId: null,
  project: null,
  clientRequestId: null,
  startedAt: null,
});

let snapshot = IDLE;
let currentFile = null;
let controller = null;
let checkToken = 0;
const listeners = new Set();

function emit() {
  for (const fn of [...listeners]) { try { fn(); } catch { /* keep notifying */ } }
}

function set(patch) {
  snapshot = Object.freeze({ ...snapshot, ...patch });
  syncUnloadGuard();
  emit();
}

export const getSnapshot = () => snapshot;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function useUpload() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const isBusy = (s = snapshot) => s.phase === "uploading" || s.phase === "verifying";
export const getFile = () => currentFile;

// ---------------------------------------------------------------- unload guard
let guardOn = false;
function onBeforeUnload(e) {
  e.preventDefault();
  e.returnValue = "";
  return "";
}
function syncUnloadGuard() {
  if (typeof window === "undefined") return;
  const want = isBusy(snapshot);
  if (want && !guardOn) { window.addEventListener("beforeunload", onBeforeUnload); guardOn = true; }
  else if (!want && guardOn) { window.removeEventListener("beforeunload", onBeforeUnload); guardOn = false; }
}

// ---------------------------------------------------------------- metadata
function revokePoster(meta) {
  if (meta?.posterUrl && meta.posterUrl.startsWith("blob:")) {
    try { URL.revokeObjectURL(meta.posterUrl); } catch { /* already gone */ }
  }
}

// Reads duration + dimensions (+ a poster frame when decodable) through a detached <video>.
// Resolves null when the browser can't read the file within the timeout (e.g. HEVC on Chrome).
export function readVideoMeta(file, timeoutMs = METADATA_TIMEOUT_MS) {
  if (typeof document === "undefined" || !file) return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;
    let meta = null;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      try { video.load(); } catch { /* detached */ }
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(meta), timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration) ? video.duration : null;
      const width = video.videoWidth || 0, height = video.videoHeight || 0;
      if (durationSec == null) { done(null); return; }
      meta = { durationSec, width, height, aspect: width && height ? aspectOf(width, height) : null, posterUrl: null, previewable: width > 0 && height > 0 };
      if (!meta.previewable) { done(meta); return; }
      try { video.currentTime = Math.min(1, durationSec / 3); } catch { done(meta); }
    };
    video.onseeked = () => {
      try {
        const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => done(blob ? { ...meta, posterUrl: URL.createObjectURL(blob) } : meta), "image/jpeg", 0.82);
      } catch {
        done(meta);
      }
    };
    video.onerror = () => done(meta);
    video.src = url;
  });
}

// ---------------------------------------------------------------- checks
const extOf = (name) => {
  const i = String(name || "").lastIndexOf(".");
  return i > 0 ? String(name).slice(i).toLowerCase() : "";
};

// Pure check of what can be known without decoding. Returns issues[].
export function checkBasics(file, limits = DEFAULT_LIMITS) {
  const L = { ...DEFAULT_LIMITS, ...(limits || {}) };
  const ext = extOf(file?.name);
  const typeOk = L.acceptedTypes.includes(file?.type) || L.acceptedExtensions.includes(ext);
  if (!typeOk) {
    const label = ext || (file?.type ? `.${String(file.type).split("/").pop()}` : "unknown");
    return [{ code: "WRONG_TYPE", blocking: true, message: UPLOAD_COPY.wrongType(label) }];
  }
  if (!file.size) return [{ code: "EMPTY", blocking: true, message: UPLOAD_COPY.empty }];
  const maxBytes = L.maxUploadMb * 1024 * 1024;
  if (file.size > maxBytes) return [{ code: "TOO_LARGE", blocking: true, message: UPLOAD_COPY.tooLarge(fmtBytes(file.size), fmtBytes(maxBytes)) }];
  return [];
}

// Checks that need metadata. meta null → the non-blocking "can't preview" note.
export function checkMeta(meta, limits = DEFAULT_LIMITS) {
  const L = { ...DEFAULT_LIMITS, ...(limits || {}) };
  if (!meta) return [{ code: "UNREADABLE", blocking: false, message: UPLOAD_COPY.unreadable }];
  const issues = [];
  if (meta.durationSec > L.maxDurationSec + 0.5) issues.push({ code: "TOO_LONG", blocking: true, message: UPLOAD_COPY.tooLong(fmtDuration(meta.durationSec), fmtDuration(L.maxDurationSec)) });
  else if (meta.durationSec < L.minDurationSec) issues.push({ code: "TOO_SHORT", blocking: true, message: UPLOAD_COPY.tooShort(Math.floor(meta.durationSec), L.minDurationSec) });
  if (!meta.previewable) issues.push({ code: "UNREADABLE", blocking: false, message: UPLOAD_COPY.unreadable });
  else if (Math.min(meta.width, meta.height) < L.warnShortEdgePx) issues.push({ code: "LOW_RES", blocking: false, message: UPLOAD_COPY.lowRes(shortEdgeLabel(meta.width, meta.height)) });
  return issues;
}

// checkFile(file, { limits }) → snapshot after checking. Ignored while an upload is in flight.
export async function checkFile(file, { limits } = {}) {
  if (isBusy()) return snapshot;
  const token = ++checkToken;
  revokePoster(snapshot.meta);
  currentFile = file || null;
  const info = file ? { name: file.name, size: file.size, type: file.type, ext: extOf(file.name), lastModified: file.lastModified } : null;
  set({ ...IDLE, phase: file ? "checking" : "idle", file: info });
  if (!file) return snapshot;

  const basics = checkBasics(file, limits);
  if (basics.some((i) => i.blocking)) {
    set({ phase: "rejected", issues: basics });
    return snapshot;
  }
  const meta = await readVideoMeta(file);
  if (token !== checkToken) { revokePoster(meta); return snapshot; }
  const issues = [...basics, ...checkMeta(meta, limits)];
  set({ phase: issues.some((i) => i.blocking) ? "rejected" : "ready", meta, issues });
  return snapshot;
}

// start({ settings, logo, consent }) → projectId | null. The settings object is API.md §7 shape.
export async function start({ settings = {}, logo = null, consent = false } = {}) {
  if (!currentFile || !["ready", "failed", "cancelled"].includes(snapshot.phase)) return null;
  const others = snapshot.issues.filter((i) => i.code !== "CONSENT_MISSING");
  if (!consent) {
    set({ issues: [...others, { code: "CONSENT_MISSING", blocking: true, message: UPLOAD_COPY.consentMissing }] });
    return null;
  }
  const retrying = snapshot.phase === "failed" && snapshot.clientRequestId;
  const clientRequestId = retrying ? snapshot.clientRequestId : newClientRequestId();
  controller = new AbortController();
  const { signal } = controller;
  const file = currentFile;
  set({
    phase: "uploading",
    issues: others,
    error: null,
    clientRequestId,
    startedAt: Date.now(),
    progress: { loaded: 0, total: file.size, pct: 0, rateBps: 0, etaSec: null },
  });
  try {
    const res = await uploadEditVideo(
      file,
      { settings: { ...settings, consent: { thirdPartyAi: true, termsVersion: settings?.consent?.termsVersion || CONSENT_TERMS_VERSION } }, logo, clientRequestId },
      {
        signal,
        onProgress: (p) => { if (snapshot.phase === "uploading") set({ progress: p }); },
        onPhase: (ph) => { if (ph === "verifying" && snapshot.phase === "uploading") set({ phase: "verifying", progress: { ...(snapshot.progress || {}), pct: 100, loaded: file.size, total: file.size, etaSec: null } }); },
      },
    );
    const project = res?.project || null;
    if (project?.id) pushRecent(project.id, { title: project.title });
    set({ phase: "started", projectId: project?.id || null, project });
    return project?.id || null;
  } catch (err) {
    if (err?.name === "AbortError") {
      set({ phase: "cancelled", progress: null });
      return null;
    }
    const pct = snapshot.progress?.pct ?? 0;
    const status = Number(err?.status) || 0;
    const copy = status === 0
      ? { title: "SIGNAL LOST", body: UPLOAD_COPY.offline(pct) }
      : status === 401
        ? { title: "SIGNED OUT", body: UPLOAD_COPY.sessionEnded }
        : errorCopy(err);
    set({ phase: "failed", error: { status, code: err?.code || null, title: copy.title, message: copy.body, needAuth: status === 401 } });
    return null;
  } finally {
    controller = null;
  }
}

export function cancel() {
  if (controller) { controller.abort(); return; }
  if (snapshot.phase === "checking") reset();
}

export function reset() {
  if (controller) controller.abort();
  checkToken++;
  revokePoster(snapshot.meta);
  currentFile = null;
  snapshot = IDLE;
  syncUnloadGuard();
  emit();
}

// Hand-off after the session screen has taken over the new edit.
export function acknowledgeStarted(projectId) {
  if (snapshot.phase === "started" && (!projectId || snapshot.projectId === projectId)) reset();
}

// Remove a blocking consent issue once the box is ticked.
export function clearConsentIssue() {
  if (snapshot.issues.some((i) => i.code === "CONSENT_MISSING")) set({ issues: snapshot.issues.filter((i) => i.code !== "CONSENT_MISSING") });
}
