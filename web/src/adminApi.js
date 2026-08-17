// KEYFRAME ADMIN API CLIENT — the template creation → publish pipeline.
//
// Deliberately NOT folded into api.js. That file is the public client (auth,
// projects, frames); every call here answers to requireAdmin instead, so 401 and
// 403 are ordinary responses the screens must tell apart — "log in" versus
// "logged in, not you". api.js's fetch wrapper is module-private and its json()
// keeps only the message off a failed response, which is exactly the thing that
// cannot be thrown away here: PUBLISH refuses with 422 and a `blocking` array
// the review screen has to print verbatim.
//
// PUBLISH IS A FILESYSTEM MOVE, not a flag — drafts live in a staging directory
// and publishing moves them into frames/, where frame_registry's uncached
// readdirSync picks them up instantly. Nothing in this client filters on a
// status to keep unpublished work hidden; it is hidden because it is not there.
import { API_BASE } from "./api.js";

const adminFetch = (path, opts = {}) => fetch(API_BASE + path, { credentials: "include", ...opts });
const jbody = (method) => (path, body) =>
  adminFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
const jpost = jbody("POST");
const jpatch = jbody("PATCH");

// Carries the HTTP status and the whole response body, because the two failures
// this surface has to explain are structured: 403 (not an admin) has to look
// different from a validation error, and 422 arrives with the reasons publish
// refused. An Error with only a message loses both.
export class AdminApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "AdminApiError";
    this.status = status ?? 0;
    this.body = body || {};
    this.blocking = Array.isArray(this.body.blocking) ? this.body.blocking : [];
  }
}

async function json(resp) {
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = Array.isArray(body.details) ? `: ${body.details.join("; ")}` : "";
    throw new AdminApiError((body.error || `HTTP ${resp.status}`) + detail, { status: resp.status, body });
  }
  return body;
}

// The record routes answer { template: describe(), running, progress }; the
// action routes answer 202 { templateId, version, status, … }. Both are folded
// into ONE flat object so every screen reads a template the same way, and a
// wrapper that isn't there is simply absent rather than a crash.
const oneTemplate = (b) => {
  if (!b || typeof b !== "object") return {};
  const t = b.template || b;
  const live = {};
  if ("running" in b) live.running = b.running;     // "generating" | "previewing" | "qa" | null
  if ("progress" in b) live.progress = b.progress;  // { phase, step, pct, at }
  return { ...t, ...live };
};
const manyTemplates = (b) => (Array.isArray(b) ? b : b?.templates || b?.items || []);

// The renderer families a spec may target — the same list scripts/new-pack.js
// exports, which is what the server validates `family` against. An LLM writes a
// VARIANT over one of these; it never writes a renderer.
export const FAMILIES = [
  "retro-terminal", "healthcare-soft", "data-viz-mono", "fintech-dark", "saas-gradient", "liquid-glass",
];

// ---------------------------------------------------------------- lifecycle
// Mirrors STATUS in server/src/admin/template_store.js. The store is the
// contract; this is a display copy, so it never gates a request — an unknown
// status renders as itself rather than disappearing from the dashboard.
export const STATUS = {
  DRAFT: "DRAFT",
  GENERATING: "GENERATING",
  GENERATED: "GENERATED",
  TESTING: "TESTING",
  READY_TO_PUBLISH: "READY_TO_PUBLISH",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
  ARCHIVED: "ARCHIVED",
};

export const STATUS_META = {
  DRAFT: { label: "Draft", c: "#7d766a" },
  GENERATING: { label: "Generating", c: "#e832a8", live: true },
  GENERATED: { label: "Generated", c: "#23c8e0" },
  TESTING: { label: "Testing", c: "#ffb03a", live: true },
  READY_TO_PUBLISH: { label: "Ready to publish", c: "#b9f24a" },
  PUBLISHED: { label: "Published", c: "#2b5bff" },
  FAILED: { label: "Failed", c: "#d8271b" },
  ARCHIVED: { label: "Archived", c: "#8a63ff" },
};
export const statusMeta = (s) => STATUS_META[s] || { label: String(s || "unknown"), c: "#7d766a" };

// Dashboard filter tabs. GENERATED sits in this list even though it is easy to
// forget: it is the status a template rests in between the pipeline finishing
// and an admin reviewing it — the review queue itself — and without a tab it
// would only ever be reachable under All.
export const STATUS_TABS = [
  { key: null, label: "All", c: "#17130e" },
  { key: STATUS.DRAFT, label: "Draft", c: STATUS_META.DRAFT.c },
  { key: STATUS.GENERATING, label: "Generating", c: STATUS_META.GENERATING.c },
  { key: STATUS.GENERATED, label: "Generated", c: STATUS_META.GENERATED.c },
  { key: STATUS.TESTING, label: "Testing", c: STATUS_META.TESTING.c },
  { key: STATUS.READY_TO_PUBLISH, label: "Ready to publish", c: STATUS_META.READY_TO_PUBLISH.c },
  { key: STATUS.PUBLISHED, label: "Published", c: STATUS_META.PUBLISHED.c },
  { key: STATUS.ARCHIVED, label: "Archived", c: STATUS_META.ARCHIVED.c },
  { key: STATUS.FAILED, label: "Failed", c: STATUS_META.FAILED.c },
];

// A template is IN FLIGHT while the server owns it. Nothing destructive is
// offered in these two states and the screens keep polling through them.
// `running` is the other half of that signal: preview is deliberately
// status-neutral server-side (re-rendering a poster is not a change of what the
// template IS), so it only ever shows up as running === "previewing".
export const IN_FLIGHT = new Set([STATUS.GENERATING, STATUS.TESTING]);
export const isBusy = (t) => !!t && (!!t.running || IN_FLIGHT.has(t.status));

// ---------------------------------------------------------------- pipeline
// The lifecycle the generator screen narrates, in order. Same shape as
// ProductionTheater's STAGES so the checklist reads identically to the one
// users see on a film.
export const PIPELINE_STAGES = [
  { key: "generate", label: "GENERATING TEMPLATE", c: "#e832a8" },
  { key: "source", label: "CREATING SOURCE FILES", c: "#23c8e0" },
  { key: "validate", label: "VALIDATING", c: "#b9f24a" },
  { key: "thumbnail", label: "GENERATING THUMBNAIL", c: "#ffb03a" },
  { key: "preview", label: "GENERATING PREVIEW", c: "#2b5bff" },
  { key: "qa", label: "RUNNING QUALITY CHECKS", c: "#8a63ff" },
  { key: "ready", label: "READY FOR REVIEW", c: "#b9f24a" },
];

// Which of the seven the server is on. `running` is the phase it reports —
// "generating" covers the first three steps (spec → pack.json + FRAME.md →
// the manifest check), "previewing" the poster and the clip, "qa" the checks —
// and `progress.pct` places the tick inside a phase that owns more than one.
// The lifecycle status is the fallback, so the checklist still advances for a
// build that reports no progress at all.
const PHASE_SPAN = { generating: [0, 2], previewing: [3, 4], qa: [5, 5] };

export function pipelineProgress(t, floor = -1) {
  const status = t?.status || null;
  const failed = status === STATUS.FAILED;
  const span = PHASE_SPAN[t?.running];
  let index;
  if (span) {
    const pct = Number.isFinite(t?.progress?.pct) ? Math.min(100, Math.max(0, t.progress.pct)) : 0;
    index = span[0] + Math.min(span[1] - span[0], Math.floor((pct / 100) * (span[1] - span[0] + 1)));
  } else if (status === STATUS.READY_TO_PUBLISH || status === STATUS.PUBLISHED || status === STATUS.ARCHIVED) {
    index = PIPELINE_STAGES.length - 1;
  } else if (status === STATUS.GENERATED) {
    // Generated, nothing running: the source exists, so the media step is where
    // it stands or stopped — unless QA already scored it, which is the end.
    index = t?.qaScore != null || t?.previewVideo ? PIPELINE_STAGES.length - 2 : 3;
  } else if (status === STATUS.GENERATING || status === STATUS.TESTING) {
    index = status === STATUS.TESTING ? 5 : 0;
  } else {
    index = failed ? floor : -1;
  }
  index = Math.max(index, floor);
  return { index, done: index >= PIPELINE_STAGES.length - 1 && !failed, failed, status, step: t?.progress?.step || null };
}

// ---------------------------------------------------------------- templates
export async function listTemplates({ status = null, q = null } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const qs = params.toString();
  return manyTemplates(await json(await adminFetch(`/api/admin/templates${qs ? `?${qs}` : ""}`)));
}

export async function getTemplate(id) {
  return oneTemplate(await json(await adminFetch(`/api/admin/templates/${id}`)));
}

// fields: { name, prompt, orientation, description?, category?, tags?: string[],
//           style?, brandColor?, durationSec?, notes? }
export async function createTemplate(fields) {
  return oneTemplate(await json(await jpost("/api/admin/templates", fields)));
}

export async function updateTemplate(id, patch) {
  return oneTemplate(await json(await jpatch(`/api/admin/templates/${id}`, patch)));
}

export async function deleteTemplate(id) {
  return json(await adminFetch(`/api/admin/templates/${id}`, { method: "DELETE" }));
}

export async function generateTemplate(id) {
  return oneTemplate(await json(await jpost(`/api/admin/templates/${id}/generate`)));
}

// ---- auto generate -------------------------------------------------------
// The form's opposite: no brief, just a count. The server holds a curated pool
// of briefs, creates each template, and takes it generate -> preview -> QA
// IN SERIES (renders are ~2 min each and do not parallelise on one box). The
// batch therefore outlives this tab — the screen polls it rather than driving
// it, so closing the browser does not abandon fourteen half-made templates.
export const MAX_AUTO_BATCH = 15;

// `requirement` turns the batch into a CAMPAIGN: N templates on one subject,
// each on a different angle (the announcement, the numbers, the story…) with its
// own allocated motion. Omit it and the curated brief pool stands in.
// `orientation` is "vertical" | "horizontal" | "mixed" and applies to the WHOLE
// run — a campaign normally ships to one surface, so the aspect is chosen once.
export async function startAutoBatch(count, requirement, orientation) {
  const b = await json(await jpost("/api/admin/templates/auto", {
    count,
    requirement: requirement || "",
    orientation: orientation || "mixed",
  }));
  return b?.batch || b;
}

// Suggested campaign subjects for the chips. Free text always wins.
export const CAMPAIGN_THEMES = [
  "mars exploration", "dogs", "cats playing", "jungle wildlife", "street food",
  "fintech", "developer tools", "personal finance", "fitness", "travel",
  "music streaming", "gaming", "education", "real estate", "coffee roasting",
];

// { batch, maxBatch, available } — `available` is how many unused briefs remain,
// which is the real ceiling on the count field.
export async function autoBatchStatus() {
  return json(await adminFetch("/api/admin/templates/auto"));
}

export async function cancelAutoBatch() {
  const b = await json(await jpost("/api/admin/templates/auto/cancel"));
  return b?.batch || b;
}

// Renders this version's thumbnail + preview clip. Status-neutral server-side
// (it only writes the two media refs the publish gate insists on), so it shows
// up as running === "previewing" rather than as a lifecycle move.
export async function previewTemplate(id) {
  return oneTemplate(await json(await jpost(`/api/admin/templates/${id}/preview`)));
}

export async function testTemplate(id) {
  return oneTemplate(await json(await jpost(`/api/admin/templates/${id}/test`)));
}

export async function qaTemplate(id) {
  return oneTemplate(await json(await jpost(`/api/admin/templates/${id}/qa`)));
}

// Throws AdminApiError with .blocking populated on the 422 refusal.
export async function publishTemplate(id) {
  return oneTemplate(await json(await jpost(`/api/admin/templates/${id}/publish`)));
}

export async function unpublishTemplate(id) {
  return oneTemplate(await json(await jpost(`/api/admin/templates/${id}/unpublish`)));
}

export async function archiveTemplate(id) {
  return oneTemplate(await json(await jpost(`/api/admin/templates/${id}/archive`)));
}

export async function createVersion(id) {
  return oneTemplate(await json(await jpost(`/api/admin/templates/${id}/versions`)));
}

// Poll a template until the server is no longer working on it. Same contract as
// pollProject in api.js — onTick fires on every poll so screens render live —
// against the record route, which is the `statusUrl` the 202s hand back. (There
// is an SSE stream at /events too; polling is what the studio screens already do
// and it survives a proxy that buffers event-streams.)
export function pollTemplateStatus(id, { intervalMs = 1500, timeoutMs = 12 * 60 * 1000, onTick, predicate, signal } = {}) {
  const startedAt = Date.now();
  let sawWork = false;
  let idleTicks = 0;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (signal?.aborted) return reject(new Error("aborted"));
      let t;
      try { t = await getTemplate(id); } catch (e) { return reject(e); }
      onTick?.(t);
      const working = isBusy(t);
      if (working) sawWork = true; else idleTicks += 1;
      // Two idle polls, not one: a stage that finishes between the 202 and the
      // first poll would otherwise never register as having run, and a create
      // that has not been picked up yet would resolve instantly on its DRAFT.
      const settled = predicate ? predicate(t) : !working && (sawWork || idleTicks >= 2);
      // Resolve, never reject, on the cap: an admin whose queue went quiet gets
      // the last known state and a link to the template, not a dead screen.
      if (settled || Date.now() - startedAt > timeoutMs) return resolve(t);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

// ---------------------------------------------------------------- helpers
// Client-side echo of the store's slugify, for the "this becomes frames/<slug>"
// hint under the name field. Convenience only — the server validates the slug it
// actually uses, because that string becomes a filesystem path.
export function slugPreview(name) {
  return String(name || "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function fmtWhen(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60e3) return "just now";
  if (diff < 3600e3) return `${Math.round(diff / 60e3)} min ago`;
  if (diff < 86400e3) return `${Math.round(diff / 3600e3)} h ago`;
  if (diff < 7 * 86400e3) return `${Math.round(diff / 86400e3)} d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

// QA and `blocking` entries arrive as strings from some producers and as objects
// from others. Print whatever is there rather than "[object Object]"; an
// unrecognised object is shown as its JSON, which is still the literal truth.
export function lineOf(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  if (typeof x !== "object") return String(x);
  const msg = x.message || x.reason || x.issue || x.detail || x.text || x.error || x.label;
  if (typeof msg === "string") {
    const where = x.scene != null ? ` (scene ${x.scene})` : x.file ? ` (${x.file})` : "";
    return msg + where;
  }
  return JSON.stringify(x);
}
