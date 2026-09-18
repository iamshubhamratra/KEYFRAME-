// EDIT FORMAT — every string the AI Video Edit screens print, in one place.
//
// Timecodes, sizes, ETAs, stage labels, status badges, provenance lines ("Added because line 12
// says …"), error and notice copy, cost hints and option lists. Pure (no DOM, no React) so the
// same copy renders identically on the upload page, the analysis screen, the editor and the list,
// and so it can be unit-tested. Copy follows docs/ai-video-edit/UX.md §1 and §5 verbatim; rich
// copy uses **strong** and *emphasis* markers that parseRich() splits for rendering.

import { opMeta, findItem, itemRange, anchoredWords, wordAt, outDuration, gainToDb } from "./editModel.js";
import { LANGUAGES, CAPTION_STYLES, languageMeta } from "./brand.js";

// ---------------------------------------------------------------- numbers & time
const pad2 = (n) => String(n).padStart(2, "0");
const finite = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// "00:18.2" (tenths) or "00:18"; hours only when needed ("1:02:03.4").
export function fmtTc(sec, { tenths = true } = {}) {
  const s = Math.max(0, finite(sec));
  if (tenths) {
    const total = Math.round(s * 10);
    const whole = Math.floor(total / 10);
    const h = Math.floor(whole / 3600), m = Math.floor((whole % 3600) / 60), ss = whole % 60;
    return `${h ? `${h}:` : ""}${pad2(m)}:${pad2(ss)}.${total % 10}`;
  }
  const whole = Math.floor(s + 1e-6);
  const h = Math.floor(whole / 3600), m = Math.floor((whole % 3600) / 60), ss = whole % 60;
  return `${h ? `${h}:` : ""}${pad2(m)}:${pad2(ss)}`;
}
export const fmtTcShort = (sec) => fmtTc(sec, { tenths: false });
export const fmtRange = (a, b, opts) => `${fmtTc(a, opts)}–${fmtTc(b, opts)}`;

// "2:14", "14:32", "1:02:03".
export function fmtDuration(sec) {
  const whole = Math.round(Math.max(0, finite(sec)));
  const h = Math.floor(whole / 3600), m = Math.floor((whole % 3600) / 60), s = whole % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];
function unitFor(n) {
  let u = 0, v = Math.max(0, finite(n));
  while (v >= 1024 && u < UNITS.length - 1) { v /= 1024; u++; }
  return u;
}
const scaled = (n, u) => finite(n) / Math.pow(1024, u);
const digits = (v) => (v >= 100 || Number.isInteger(v) ? Math.round(v).toString() : v.toFixed(1));

// "812 KB", "430 MB", "3.4 GB".
export function fmtBytes(n) {
  const u = unitFor(n);
  return `${digits(scaled(n, u))} ${UNITS[u]}`;
}
// "180/430 MB" in the total's unit.
export function fmtBytesPair(loaded, total) {
  const u = unitFor(total);
  return `${digits(scaled(loaded, u))}/${digits(scaled(total, u))} ${UNITS[u]}`;
}
export const fmtRate = (bps) => `${fmtBytes(bps)}/S`;
export const fmtNumber = (n) => Math.round(finite(n)).toLocaleString("en-US");

// Analysis ETA in words: "about 2 min" / "under a minute" / "finishing up".
export function fmtEta(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return "";
  const s = Number(sec);
  if (s <= 15) return "finishing up";
  if (s < 60) return "under a minute";
  return `about ${Math.max(1, Math.round(s / 60))} min`;
}
// Status-line ETA: "~12S" / "~1 MIN".
export function fmtEtaShort(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return "";
  const s = Math.max(1, Math.ceil(Number(sec)));
  return s < 60 ? `~${s}S` : `~${Math.max(1, Math.round(s / 60))} MIN`;
}
// Displayed ETA never reaches 0 and never jumps up by more than 20 % in one tick.
export function smoothEta(prevShown, nextRaw) {
  if (nextRaw == null || !Number.isFinite(Number(nextRaw))) return prevShown ?? null;
  const next = Math.max(1, Number(nextRaw));
  if (prevShown == null || !Number.isFinite(Number(prevShown))) return next;
  return next > prevShown ? Math.min(next, prevShown * 1.2) : next;
}

const toMs = (ts) => (typeof ts === "number" ? ts : Date.parse(ts));
// Relative time against a supplied `now` (clockStore) — never Date.now() in render.
export function fmtWhen(ts, now) {
  const t = toMs(ts);
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, finite(now) - t);
  if (diff < 45e3) return "just now";
  if (diff < 3600e3) { const m = Math.max(1, Math.round(diff / 60e3)); return `${m} min ago`; }
  if (diff < 86400e3) return `${Math.round(diff / 3600e3)} h ago`;
  if (diff < 2 * 86400e3) return "yesterday";
  if (diff < 7 * 86400e3) return `${Math.round(diff / 86400e3)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function aspectOf(w, h) {
  const r = finite(w) / Math.max(1, finite(h));
  if (!r) return null;
  const opts = [["9:16", 9 / 16], ["1:1", 1], ["16:9", 16 / 9]];
  return opts.reduce((best, o) => (Math.abs(Math.log(r / o[1])) < Math.abs(Math.log(r / best[1])) ? o : best))[0];
}
export const shortEdgeLabel = (w, h) => `${Math.min(finite(w), finite(h))}p`;
export const aspectCss = (aspect) => (aspect === "16:9" ? "16 / 9" : aspect === "1:1" ? "1 / 1" : "9 / 16");

// ---------------------------------------------------------------- rich copy
// "That's a **.avi** file." → [{text:"That's a "}, {text:".avi", strong:true}, {text:" file."}]
export function parseRich(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  const s = String(text ?? "");
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], strong: true } : { text: m[2], em: true });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
export const plainText = (text) => parseRich(text).map((p) => p.text).join("");

// ---------------------------------------------------------------- stages
export const STAGE_ROWS = Object.freeze([
  { key: "footage", label: "FOOTAGE IN", sub: "Checking the file", stages: ["VALIDATING"] },
  { key: "prep", label: "PREPPING FOOTAGE", sub: "Compressing and normalizing", stages: ["COMPRESSING"] },
  { key: "audio", label: "MEASURING AUDIO", sub: "Levels and pauses", stages: ["EXTRACTING_AUDIO"] },
  { key: "transcribe", label: "TRANSCRIBING", sub: "Sending audio to our speech model", stages: ["TRANSCRIBING"] },
  { key: "watch", label: "WATCHING THE TAKE", sub: "AI checks sampled frames for your face and framing", stages: ["ANALYZING_VIDEO"] },
  { key: "read", label: "READING THE SCRIPT", sub: "AI finds topics, hook and key lines", stages: ["ANALYZING_CONTENT"] },
  { key: "direct", label: "DIRECTING THE CUT", sub: "Cuts, captions, effects", stages: ["BUILDING_EDIT_PLAN"] },
  { key: "pull", label: "PULLING B-ROLL & MUSIC", sub: "Stock library and music", stages: ["SEARCHING_BROLL", "SCORING_ASSETS"] },
  { key: "roll", label: "ROLLING THE PREVIEW", sub: "First draft", stages: ["PREPARING_RENDER", "RENDERING", "POST_PROCESSING"] },
  { key: "check", label: "CHECKING THE CUT", sub: "Automatic quality check", stages: ["QUALITY_CHECK"] },
  { key: "ready", label: "READY", sub: "", stages: ["READY", "COMPLETED"] },
].map((r) => Object.freeze({ ...r, stages: Object.freeze(r.stages) })));

// Server pipeline order (server/src/video_edit/constants.js STAGES).
export const SERVER_STAGES = Object.freeze([
  "VALIDATING", "COMPRESSING", "EXTRACTING_AUDIO", "TRANSCRIBING", "ANALYZING_VIDEO", "ANALYZING_CONTENT",
  "SEARCHING_BROLL", "SCORING_ASSETS", "BUILDING_EDIT_PLAN", "PREPARING_RENDER", "RENDERING", "POST_PROCESSING", "QUALITY_CHECK",
]);

export const STAGE_COPY = Object.freeze(Object.fromEntries(
  STAGE_ROWS.flatMap((row) => row.stages.map((s) => [s, Object.freeze({ label: row.label, sub: row.sub, row: row.key })])),
));

export const ACTIVE_STATUSES = Object.freeze(["QUEUED", "PROCESSING"]);
export const EDITABLE_STATUSES = Object.freeze(["READY", "RENDERING", "COMPLETED"]);
export const isAnalyzing = (status) => ACTIVE_STATUSES.includes(status);
export const isEditable = (status) => EDITABLE_STATUSES.includes(status);

// Checklist rows with state: done | current | pending | failed | skipped | stopped.
export function stageRows(view) {
  const status = view?.status;
  const stages = view?.stages || null;
  const current = view?.progress?.stage || view?.stage || null;
  const reasonStage = view?.statusReason?.stage || current;
  const readyish = status === "READY" || status === "RENDERING" || status === "COMPLETED";
  const curIdx = SERVER_STAGES.indexOf(current);

  return STAGE_ROWS.map((row) => {
    let state = "pending";
    if (row.key === "ready") {
      state = readyish ? "done" : "pending";
    } else if (readyish) {
      const st = row.stages.map((s) => stages?.[s]?.status);
      state = st.every((x) => x === "skipped") ? "skipped" : "done";
    } else if (stages && Object.keys(stages).length) {
      const st = row.stages.map((s) => stages[s]?.status || "pending");
      if (st.includes("failed")) state = "failed";
      else if (st.every((x) => x === "done" || x === "skipped")) state = st.every((x) => x === "skipped") ? "skipped" : "done";
      else if (st.includes("running") || (row.stages.includes(current) && status === "PROCESSING")) state = "current";
      else if (st.some((x) => x === "done" || x === "skipped")) state = status === "PROCESSING" ? "current" : "pending";
    } else if (curIdx >= 0) {
      const idx = Math.max(...row.stages.map((s) => SERVER_STAGES.indexOf(s)));
      const minIdx = Math.min(...row.stages.map((s) => SERVER_STAGES.indexOf(s)));
      if (idx < curIdx) state = "done";
      else if (minIdx <= curIdx && idx >= curIdx) state = status === "PROCESSING" ? "current" : "pending";
    }
    if ((status === "NEEDS_ATTENTION" || status === "FAILED") && row.stages.includes(reasonStage)) state = "failed";
    if (status === "CANCELLED" && row.stages.includes(reasonStage) && state !== "done") state = "stopped";
    return { key: row.key, label: row.label, sub: row.sub, state };
  });
}

export function queueLine(position) {
  const n = Math.max(0, Math.round(finite(position)));
  if (!n) return "";
  return `IN LINE — ${n} ${n === 1 ? "EDIT" : "EDITS"} AHEAD`;
}

// ---------------------------------------------------------------- status badges
const C = Object.freeze({ mag: "#e832a8", cy: "#23c8e0", am: "#ffb03a", lm: "#b9f24a", cb: "#2b5bff", rec: "#d8271b", dim: "#7d766a" });
export const TOKEN_HEX = C;

// My-edits badge for a ProjectSummary (or a local pending upload).
export function statusBadge(p, { upload = null } = {}) {
  if (upload) return { label: `UPLOADING ${Math.round(finite(upload.pct))}%`, color: C.mag, live: true };
  switch (p?.status) {
    case "QUEUED": return { label: "ANALYZING · IN LINE", color: C.cy, live: true };
    case "PROCESSING": return { label: `ANALYZING · ${STAGE_COPY[p.stage]?.label || "WORKING"}`, color: C.cy, live: true };
    case "READY": case "RENDERING": return { label: "READY", color: C.lm, live: false };
    case "COMPLETED": return p.currentExportId ? { label: "EXPORTED", color: C.cb, live: false } : { label: "READY", color: C.lm, live: false };
    case "NEEDS_ATTENTION": return { label: "NEEDS ATTENTION", color: C.am, live: false };
    case "FAILED": return { label: "FAILED", color: C.rec, live: false };
    case "CANCELLED": return { label: "STOPPED", color: C.dim, live: false };
    case "DELETING": return { label: "DELETING", color: C.dim, live: true };
    default: return { label: String(p?.status || "UNKNOWN").replace(/_/g, " "), color: C.dim, live: false };
  }
}

// ---------------------------------------------------------------- status lines
export function uploadStatusLine(snap) {
  if (!snap) return "";
  if (snap.phase === "checking") return "READING THE FILE…";
  if (snap.phase === "verifying" || (snap.phase === "uploading" && finite(snap.progress?.pct) >= 100)) return "CHECKING THE FOOTAGE…";
  if (snap.phase !== "uploading" || !snap.progress) return "";
  const p = snap.progress;
  const parts = [`UPLOADING ${Math.floor(finite(p.pct))}%`, fmtBytesPair(p.loaded, p.total)];
  if (p.rateBps > 0) parts.push(fmtRate(p.rateBps));
  if (p.etaSec != null) parts.push(fmtEtaShort(p.etaSec));
  return parts.join(" · ");
}

// Editor header: "● UPDATING 64% · ~12S" · "PREVIEW r14 · 2 CHANGES PENDING" · "PREVIEW UP TO DATE ✓".
export function previewStatusLine({ previewRevision = null, pendingChanges = 0, render = null } = {}) {
  if (render && render.kind !== "export" && (render.status === "running" || render.status === "queued")) {
    return render.status === "queued" ? "● UPDATE QUEUED" : `● UPDATING ${Math.round(finite(render.pct))}%${render.etaSec ? ` · ${fmtEtaShort(render.etaSec)}` : ""}`;
  }
  if (pendingChanges > 0) return `PREVIEW${previewRevision != null ? ` r${previewRevision}` : ""} · ${pendingChanges} ${pendingChanges === 1 ? "CHANGE" : "CHANGES"} PENDING`;
  return previewRevision != null ? "PREVIEW UP TO DATE ✓" : "NO PREVIEW YET";
}

export function exportStatusLine(render, { srt = true, vtt = true } = {}) {
  if (!render) return "";
  if (render.status === "done") return `EXPORTED ✓ MP4${srt ? " + SRT" : ""}${vtt ? " + VTT" : ""}`;
  if (render.status === "failed") return "EXPORT FAILED";
  return `EXPORTING r${render.planRevision} · ${Math.round(finite(render.pct))}%`;
}

// "ORIGINAL 2:14 → EDIT 1:32"
export const lengthLine = (sourceSec, outSec) => `ORIGINAL ${fmtDuration(sourceSec)} → EDIT ${fmtDuration(outSec)}`;

// "WHAT WE'RE HEARING" rows from ProjectView.discoveries + source.
export function discoveryLines(discoveries = {}, source = null) {
  const d = discoveries || {};
  const rows = [];
  if (source?.durationSec) rows.push({ key: "source", text: `${fmtDuration(source.durationSec)} · ${source.width}×${source.height}${source.fps ? ` · ${Math.round(source.fps)}FPS` : ""}` });
  if (d.language) rows.push({ key: "language", text: (languageMeta(d.language)?.name || d.language).toUpperCase() });
  if (d.words != null) rows.push({ key: "words", text: `${fmtNumber(d.words)} WORDS${d.wpm ? ` · ${Math.round(d.wpm)} WPM` : ""}` });
  if (d.fillersFound != null) rows.push({ key: "fillers", text: `${d.fillersFound} ${d.fillersFound === 1 ? "FILLER" : "FILLERS"} FOUND` });
  if (d.silencesFound != null) rows.push({ key: "silences", text: `${d.silencesFound} ${d.silencesFound === 1 ? "SILENCE" : "SILENCES"}${d.silenceSec != null ? ` · ${Math.round(d.silenceSec)}S` : ""}` });
  if (Array.isArray(d.topics) && d.topics.length) rows.push({ key: "topics", chips: d.topics.slice(0, 6) });
  if (d.hook) rows.push({ key: "hook", text: `Hook we'd lead with: “${d.hook}”`, prose: true });
  if (d.brollMoments != null) rows.push({ key: "broll", text: `${d.brollMoments} B-ROLL ${d.brollMoments === 1 ? "MOMENT" : "MOMENTS"}` });
  if (d.faceFound != null) rows.push({ key: "face", text: d.faceFound ? "FACE FOUND ✓" : "NO FACE FOUND — WE'LL KEEP THE FULL FRAME" });
  return rows;
}

// ---------------------------------------------------------------- settings & options
export const CONSENT_TERMS_VERSION = "2026-09";

// Upload defaults per UX.md §1b (the Customize table), shaped as API.md §7 Settings.
export const DEFAULT_UPLOAD_SETTINGS = Object.freeze({
  language: "auto",
  output: { aspect: "source" },
  captions: { enabled: true, styleId: "bold_pop", maxWordsPerLine: 2, position: "auto", language: "auto" },
  brand: { palette: null, logo: { placement: "tr", show: "always" } },
  music: { enabled: true },
  sfx: { enabled: true },
  broll: { enabled: true, intensity: "medium", allowImages: true },
  effects: { intensity: "subtle", autoJumpCuts: true },
  removeFillers: "light",
  removeSilence: { enabled: true, pace: "natural" },
  autoRender: true,
  exportProfile: "export1080",
  privacy: { allowCloudVision: true },
});

export const FORMAT_OPTIONS = Object.freeze([
  { value: "source", label: "MATCH MY VIDEO", w: 14, h: 18 },
  { value: "9:16", label: "9:16", sub: "Vertical", w: 11, h: 20 },
  { value: "16:9", label: "16:9", sub: "Widescreen", w: 22, h: 12 },
  { value: "1:1", label: "1:1", sub: "Square", w: 16, h: 16 },
]);
export const CAPTION_STYLE_OPTIONS = Object.freeze([...CAPTION_STYLES.map((s) => ({ value: s.id, label: s.label, sub: s.sub })), { value: "off", label: "OFF", sub: "No burned-in captions" }]);
export const WORDS_PER_LINE_OPTIONS = Object.freeze([{ value: 1, label: "1" }, { value: 2, label: "2" }, { value: 3, label: "3" }]);
export const BROLL_OPTIONS = Object.freeze([
  { value: "low", label: "LOW", sub: "≈ 1 every 15 s" },
  { value: "medium", label: "MEDIUM", sub: "≈ 1 every 12 s" },
  { value: "high", label: "HIGH", sub: "≈ 1 every 8 s" },
]);
export const EFFECTS_OPTIONS = Object.freeze([{ value: "subtle", label: "SUBTLE" }, { value: "dynamic", label: "DYNAMIC" }]);
export const FILLER_OPTIONS = Object.freeze([{ value: "light", label: "UM/UH ONLY" }, { value: "aggressive", label: "+ LIKE, YOU KNOW" }]);
export const PACE_OPTIONS = Object.freeze([{ value: "natural", label: "NATURAL" }, { value: "fast", label: "FAST" }, { value: "extra_fast", label: "EXTRA FAST" }]);
export const EXPORT_QUALITY_OPTIONS = Object.freeze([{ value: "export1080", label: "1080p", sub: "Default" }, { value: "export720", label: "720p", sub: "Smaller file" }]);
export const BROLL_LAYOUT_OPTIONS = Object.freeze([{ value: "FULL", label: "FULL" }, { value: "SPLIT", label: "SPLIT" }, { value: "PIP", label: "PIP" }]);
export const TRANSCRIPT_FILTERS = Object.freeze([{ value: "all", label: "ALL" }, { value: "SILENCE", label: "SILENCES" }, { value: "FILLER", label: "FILLERS" }, { value: "REPEAT", label: "REPEATS" }]);
export const WHAT_YOU_GET = Object.freeze(["Captions", "B-roll", "Punch-ins", "Jump cuts", "Silence & filler removal", "Music", "Logo"]);

export const SEGMENT_COLORS = Object.freeze({ HOOK: C.mag, TALKING_HEAD: "rgba(242,237,226,.28)", EMPHASIS: C.am, SCREEN_CONTENT: C.cb, CTA: C.lm });
export const SEGMENT_LABELS = Object.freeze({ HOOK: "HOOK", TALKING_HEAD: "TALKING HEAD", EMPHASIS: "EMPHASIS", SCREEN_CONTENT: "SCREEN", CTA: "CTA" });

const STYLE_SHORT = { bold_pop: "BOLD", clean: "CLEAN", karaoke_blob: "KARAOKE", single_word: "SINGLE-WORD", minimal_lower: "MINIMAL", brand_bar: "BRAND BAR" };

// "9:16 · BOLD CAPTIONS · AUTO LANGUAGE · MEDIUM B-ROLL · SUBTLE FX · FILLERS + SILENCE OUT · MUSIC ON"
export function defaultsLine(settings = DEFAULT_UPLOAD_SETTINGS, { sourceAspect = null } = {}) {
  const s = settings || DEFAULT_UPLOAD_SETTINGS;
  const aspect = s.output?.aspect === "source" || !s.output?.aspect ? (sourceAspect || "MATCH MY VIDEO") : s.output.aspect;
  const captions = s.captions?.enabled === false ? "NO CAPTIONS" : `${STYLE_SHORT[s.captions?.styleId] || "BOLD"} CAPTIONS`;
  const lang = !s.captions?.language || s.captions.language === "auto" ? "AUTO LANGUAGE" : (languageMeta(s.captions.language)?.name || s.captions.language).toUpperCase();
  const broll = s.broll?.enabled === false ? "NO B-ROLL" : `${String(s.broll?.intensity || "medium").toUpperCase()} B-ROLL`;
  const fx = `${String(s.effects?.intensity || "subtle").toUpperCase()} FX`;
  const fillers = s.removeFillers && s.removeFillers !== "off";
  const silence = s.removeSilence?.enabled !== false;
  const cuts = fillers && silence ? "FILLERS + SILENCE OUT" : fillers ? "FILLERS OUT" : silence ? "SILENCE OUT" : "NOTHING CUT";
  const music = s.music?.enabled === false ? "MUSIC OFF" : "MUSIC ON";
  return [aspect, captions, lang, broll, fx, cuts, music].join(" · ");
}

// ---------------------------------------------------------------- upload copy (UX.md §1b)
export const UPLOAD_COPY = Object.freeze({
  dropzone: "Choose a video file, or drop it here",
  consent: "I agree that KEYFRAME sends my video's audio and small still frames to third-party AI models (via OpenRouter and KIE) to create this edit. The full video is never sent.",
  consentMissing: "Tick the box so we can send the audio and frames to the AI models.",
  wrongType: (ext) => `That's a **${ext}** file. AI Edit takes MP4, MOV or WEBM — export it as MP4 and drop it again.`,
  empty: "This file is empty. Try exporting it again.",
  tooLarge: (size, limit) => `This file is **${size}**. The limit is **${limit}** — export at 1080p and it will fit.`,
  unreadable: "Your browser can't preview this file (common with iPhone HEVC). You can still upload it — we'll check it when it arrives.",
  tooLong: (len, max) => `This take runs **${len}**. AI Edit handles up to **${max}** — trim it, or split it into parts.`,
  tooShort: (sec, min) => `This clip is **${sec} ${sec === 1 ? "second" : "seconds"}**. Give us at least **${min} ${min === 1 ? "second" : "seconds"}** of you talking.`,
  lowRes: (label) => `Low resolution (**${label}**) — the edit will look soft.`,
  sessionEnded: "Your session ended. Log in to keep going.",
  offline: (pct) => `SIGNAL LOST — upload stopped at ${Math.floor(finite(pct))}%. Choose the file again to retry.`,
  limits: (l) => `MP4 · MOV · WEBM · UP TO ${fmtBytes((l?.maxUploadMb ?? 500) * 1024 * 1024).replace(".0", "")} · ${l?.minDurationSec ?? 3} SEC – ${Math.round((l?.maxDurationSec ?? 300) / 60)} MIN`,
});

// ---------------------------------------------------------------- errors
export const MEDIA_REJECTED_COPY = Object.freeze({
  DURATION_TOO_LONG: "This take is longer than AI Edit handles — trim it to 5 minutes or less, or split it into parts.",
  DURATION_TOO_SHORT: "This clip is too short. Give us at least 3 seconds of you talking.",
  RESOLUTION_TOO_LOW: "The picture is too small to edit well. Export it at 720p or higher and drop it again.",
  RESOLUTION_TOO_HIGH: "The picture is larger than 4K. Export it at 4K or lower and drop it again.",
  FRAME_RATE_OUT_OF_RANGE: "The frame rate is unusual (it has to be 12–120 fps). Export it at 30 fps.",
  NO_VIDEO_STREAM: "We couldn't find any picture in this file.",
  NO_AUDIO_STREAM: "This video has no sound. AI Edit needs you talking — check the mic track and export again.",
  MULTIPLE_VIDEO_STREAMS: "This file has more than one video track. Export a single-track MP4.",
  TOO_MANY_STREAMS: "This file has too many tracks. Export a plain MP4 with one video and one audio track.",
  UNSUPPORTED_CODEC: "We can't decode this video. Export it as an H.264 MP4 and drop it again.",
  UNSUPPORTED_CONTAINER: "AI Edit takes MP4, MOV or WEBM — export it as MP4 and drop it again.",
  UNDECODABLE: "This file looks damaged — we couldn't read it. Try exporting it again.",
  PROBE_TIMEOUT: "We couldn't read this file in time. Try exporting it again as MP4.",
  WORKLOAD_TOO_LARGE: "This video is too heavy to edit at this length and resolution. Export it at 1080p.",
  BITRATE_TOO_HIGH: "The bitrate is unusually high. Export it at a standard quality setting.",
});

// Friendly { title, body, code, retryable, tone } for an EditApiError (or any error).
export function errorCopy(err) {
  const status = Number(err?.status) || 0;
  const body = err?.body || {};
  const code = err?.code || body.error || (status === 0 ? "NETWORK" : `HTTP_${status}`);
  const serverMsg = typeof body.message === "string" && body.message ? body.message : null;
  const reason = body.details?.reason || body.reason || null;
  const mk = (title, text, tone = "error") => ({ title, body: text, code, retryable: !!(body.retryable ?? err?.retryable), tone });
  if (err?.name === "AbortError" || code === "ABORTED") return mk("STOPPED", "Stopped.", "info");
  if (status === 0 || code === "NETWORK") return mk("OFFLINE", "Changes will send when you're back online.", "warn");
  switch (code) {
    case "AUTH_REQUIRED": return mk("SIGNED OUT", UPLOAD_COPY.sessionEnded);
    case "NOT_FOUND": return mk("THIS EDIT COULDN'T BE LOADED", "It may have been deleted or expired.");
    case "REVISION_CONFLICT": return mk("EDIT CHANGED ELSEWHERE", "This edit changed in another tab.", "warn");
    case "MEDIA_REJECTED": return mk("WE CAN'T USE THIS FILE", MEDIA_REJECTED_COPY[reason] || serverMsg || "Not a supported video.");
    case "CONSENT_REQUIRED": return mk("CONSENT NEEDED", UPLOAD_COPY.consentMissing);
    case "FILE_TOO_LARGE": case "UNSUPPORTED_MEDIA": case "VALIDATION_FAILED": case "INVALID_OP":
      return mk(code === "INVALID_OP" ? "CHANGE NOT APPLIED" : "WE CAN'T USE THIS FILE", serverMsg || "That didn't work.");
    case "PROJECT_LOCKED": return mk("ONE MOMENT", serverMsg || "The edit is busy — trying again.", "warn");
    case "RATE_LIMITED": return mk("SLOW DOWN", serverMsg || "Too many requests — try again in a minute.", "warn");
    case "QUOTA_EXCEEDED": return mk("QUOTA REACHED", serverMsg || "You've reached your AI edit quota.", "warn");
    case "DAILY_CAP_REACHED": return mk("FULL FOR TODAY", serverMsg || "Today's AI edit capacity is used up. Try again tomorrow.", "warn");
    case "AI_BUDGET_EXHAUSTED": return mk("AI BUDGET USED", serverMsg || "The AI budget for this edit is used up.", "warn");
    case "EDITS_DISABLED": return mk("AI EDIT IS OFF", serverMsg || "AI video editing is unavailable right now.");
    case "INSUFFICIENT_STORAGE": return mk("NO ROOM ON SET", serverMsg || "We're short on storage right now. Try again later.");
    case "NOTHING_TO_CANCEL": return mk("NOTHING RUNNING", serverMsg || "Nothing is running.", "info");
    case "ILLEGAL_TRANSITION": case "NOT_RETRYABLE": return mk("NOT RIGHT NOW", serverMsg || "That isn't possible right now.", "warn");
    case "REANALYZE_REQUIRED": return mk("NEEDS A NEW ANALYSIS", serverMsg || "This change needs the take analyzed again.", "warn");
    case "NOT_READY": return mk("NOT READY YET", serverMsg || "Not ready yet.", "info");
    default:
      if (status === 401) return mk("SIGNED OUT", UPLOAD_COPY.sessionEnded);
      if (status === 404) return mk("THIS EDIT COULDN'T BE LOADED", "It may have been deleted or expired.");
      if (status >= 500) return mk("SOMETHING JAMMED", serverMsg || "The server hit a problem. Try again in a moment.");
      return mk("SOMETHING JAMMED", serverMsg || err?.message || "Something went wrong.");
  }
}

// ---------------------------------------------------------------- notices (UX.md §1f)
export const NOTICE_COPY = Object.freeze({
  STT_FAILED: { title: "TAKE FAILED · TRANSCRIPTION", body: "We couldn't transcribe the audio. Your upload is safe.", tone: "error", actions: [{ id: "retry", label: "Try again", primary: true }, { id: "continueWithoutCaptions", label: "Continue without captions" }, { id: "delete", label: "Delete" }] },
  PROVIDER_UNAVAILABLE: { title: "AI CREW UNAVAILABLE", body: "Our AI models aren't answering right now. We'll keep retrying — you can leave this page.", tone: "warn", actions: [{ id: "retry", label: "Retry now", primary: true }, { id: "stop", label: "Stop" }] },
  NO_SPEECH: { title: "NO DIALOGUE", body: "We couldn't hear anyone talking. AI Edit needs speech — check the mic track and try again.", tone: "error", actions: [{ id: "uploadAnother", label: "Upload another take", primary: true }, { id: "continueWithoutTranscript", label: "Continue without transcript" }] },
  HEURISTIC_DIRECTOR: { title: "BACKUP DIRECTOR", body: "Our AI director was unavailable, so a simpler edit was made. Captions, silence and filler removal are complete; B-roll and effects are lighter.", tone: "warn", actions: [{ id: "redirect", label: "Re-direct with AI", primary: true }, { id: "dismiss", label: "Dismiss" }] },
  NO_BROLL_FOUND: { title: "NO B-ROLL FOUND", body: "Nothing we found fit your lines well enough, so we kept you on screen.", tone: "info", actions: [{ id: "searchStock", label: "Search stock for a line", primary: true }] },
  RENDER_FAILED: { title: "PREVIEW JAMMED", body: "Revision r{rev} didn't render. Your edits are saved; the player shows r{shown}.", tone: "error", actions: [{ id: "retryRender", label: "Retry render", primary: true }, { id: "undo", label: "Undo last change" }] },
  EXPORT_FAILED: { title: "EXPORT FAILED", body: "{message}", tone: "error", actions: [{ id: "retryExport", label: "Retry export", primary: true }] },
  CANCELLED: { title: "CUT BY YOU", body: "You stopped this edit. The upload is kept.", tone: "info", actions: [{ id: "restart", label: "Restart analysis", primary: true }, { id: "delete", label: "Delete" }] },
  FAILED: { title: "THE TAKE GOT CUT", body: "{message}", tone: "error", actions: [{ id: "retry", label: "Try again", primary: true }, { id: "delete", label: "Delete" }] },
  NOT_FOUND: { title: "THIS EDIT COULDN'T BE LOADED", body: "It may have been deleted or expired.", tone: "error", actions: [{ id: "list", label: "← My edits", primary: true }] },
  CONFLICT: { title: "EDIT CHANGED ELSEWHERE", body: "This edit changed in another tab — reloaded to r{rev}. Not applied: *{labels}*.", tone: "warn", actions: [{ id: "reapply", label: "Re-apply", primary: true }] },
  OFFLINE: { title: "OFFLINE", body: "Changes will send when you're back online.", tone: "warn", actions: [] },
  TIMING_APPROX: { title: "ESTIMATED TIMING", body: "Word timing is estimated — nudge a caption if the highlight drifts.", tone: "info", actions: [] },
  EDITOR_CRASH: { title: "SOMETHING JAMMED IN THE EDIT BAY", body: "Your edits are saved on our side.", tone: "error", actions: [{ id: "reload", label: "Reload editor", primary: true }, { id: "list", label: "← My edits" }] },
});

// Copy for one notice with {placeholders} filled: noticeCopy("RENDER_FAILED", { rev: 16, shown: 14 }).
export function noticeCopy(key, vars = {}) {
  const base = NOTICE_COPY[key];
  if (!base) return null;
  const fill = (s) => String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ""));
  return { key, ...base, title: fill(base.title), body: fill(base.body), actions: base.actions.map((a) => ({ ...a })) };
}

const PROVIDER_CODES = new Set(["PROVIDER_UNAVAILABLE", "BREAKER_OPEN", "AI_UNAVAILABLE", "PROVIDERS_DOWN"]);
// The blocking notice a ProjectView calls for, or null (the editor-level notices are separate).
export function noticeForView(view) {
  if (!view) return null;
  const r = view.statusReason;
  if (view.status === "CANCELLED") return noticeCopy("CANCELLED");
  if (view.status === "NEEDS_ATTENTION" || view.status === "FAILED") {
    if (r?.code === "STT_FAILED") return noticeCopy("STT_FAILED");
    if (r?.code === "NO_SPEECH") return noticeCopy("NO_SPEECH");
    if (PROVIDER_CODES.has(r?.code)) return noticeCopy("PROVIDER_UNAVAILABLE");
    return noticeCopy("FAILED", { message: r?.message || "Something stopped this edit. Your upload is safe." });
  }
  if (view.status === "PROCESSING" && PROVIDER_CODES.has(r?.code)) return noticeCopy("PROVIDER_UNAVAILABLE");
  return null;
}

// Non-blocking editor notices from ProjectView.notices + transcript timing.
export function editorNotices(view, transcript) {
  const out = [];
  for (const n of Array.isArray(view?.notices) ? view.notices : []) {
    if (n.code === "HEURISTIC_DIRECTOR" || n.code === "AI_ANALYSIS_UNAVAILABLE" || n.code === "DIRECTOR_FALLBACK") out.push(noticeCopy("HEURISTIC_DIRECTOR"));
    else if (n.code === "NO_BROLL_FOUND") out.push(noticeCopy("NO_BROLL_FOUND"));
    else out.push({ key: n.code, title: String(n.code || "NOTE").replace(/_/g, " "), body: n.message || "", tone: n.severity === "warn" ? "warn" : "info", actions: [] });
  }
  if (transcript?.timing === "approx") out.push(noticeCopy("TIMING_APPROX"));
  return out;
}

// ---------------------------------------------------------------- cost hints
export const COST_HINT_COPY = Object.freeze({ free: "FREE · SAVED RESULTS", fetch: "STOCK SEARCH · NO AI", ai: "1 AI CALL" });
export function costHint(opOrType) {
  const op = typeof opOrType === "string" ? { type: opOrType } : opOrType;
  const meta = opMeta(op);
  return COST_HINT_COPY[meta?.costHint || "free"];
}

// ---------------------------------------------------------------- provenance (UX.md §5)
const CORNER_WORDS = { tl: "Top-left", tr: "Top-right", bl: "Bottom-left", br: "Bottom-right" };
const GRAPHIC_WORDS = { HOOK_TITLE: "hook title", KEYWORD: "keyword card", STAT: "stat card", LOWER_THIRD: "lower third", CTA: "call-to-action card", LOGO_OUTRO: "logo outro" };
const PROVIDER_NAMES = { pexels: "Pexels", pixabay: "Pixabay", openverse: "Openverse", user: "Your upload", screenshot: "Screenshot", pixabay_bridge: "Pixabay", synth: "KEYFRAME" };
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const trimPunct = (s) => String(s || "").replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "");
const num2 = (v) => String(Math.round(finite(v) * 100) / 100);

function quoteOf(item, words, range) {
  if (item?.evidence?.quote) return trimPunct(item.evidence.quote);
  if (!range || !Array.isArray(words)) return "";
  const parts = [];
  for (let i = range[0]; i <= range[1]; i++) {
    const w = wordAt(words, i);
    if (w) parts.push(w.text);
  }
  return trimPunct(parts.join(" "));
}

function sentenceNumber(transcript, sentenceId) {
  const list = Array.isArray(transcript?.sentences) ? transcript.sentences : [];
  const idx = list.findIndex((s) => s.id === sentenceId);
  return idx === -1 ? null : idx + 1;
}

function orientationOf(w, h) {
  if (!w || !h) return null;
  return w > h * 1.05 ? "landscape" : h > w * 1.05 ? "portrait" : "square";
}

// Lines explaining why an item exists. ref: { kind, id } or { kind, item }.
export function provenanceLines(ref, plan, transcript) {
  if (!ref || !plan) return [];
  const kind = ref.kind;
  const item = ref.item || findItem(plan, kind, ref.id);
  if (!item) return [];
  const words = transcript?.words;
  const range = anchoredWords(plan, kind, item);
  const r = itemRange(plan, kind, item);
  const lines = [];
  const userLine = item.origin === "user" ? "Added by you." : item.userModified ? "Changed by you — kept when AI re-plans." : null;

  switch (kind) {
    case "broll": {
      const n = sentenceNumber(transcript, item.sentenceId || item.evidence?.sentenceId);
      const q = quoteOf(item, words, range);
      if (item.origin !== "user") lines.push(n && q ? `Added because line ${n} says “${q}”.` : item.reason || "Added to illustrate this line.");
      const queries = (item.queries || []).map((x) => x.text).filter(Boolean);
      if (queries.length) lines.push(`Searched: *${queries.join(" · ")}*`);
      if (item.status === "missing" || (!item.chosen && item.status !== "pending")) {
        lines.push("No good match for this line.");
      } else if (item.chosen) {
        const top = item.topCandidates || [];
        const rank = Math.max(1, top.findIndex((c) => c.assetId === item.chosen.assetId) + 1);
        const total = Math.max(top.length, rank);
        const o = orientationOf(item.chosen.width, item.chosen.height);
        const aspect = plan.output?.aspect;
        const target = aspect === "9:16" ? "portrait" : aspect === "16:9" ? "landscape" : "square";
        const fit = !o ? "" : o === target ? ` · ${o} · fits ${aspect}` : ` · ${o} → cropped to ${aspect}`;
        lines.push(`Picked #${rank} of ${total} · ${PROVIDER_NAMES[item.chosen.provider] || capFirst(item.chosen.provider || "stock")}${fit}`);
      }
      break;
    }
    case "caption": {
      const a = range ? `Words ${range[0]}–${range[1]}` : "Words";
      lines.push(r ? `${a} · ${fmtTc(r.outIn)}–${fmtTc(r.outOut)}` : a);
      if (item.edited) lines.push("Edited by you.");
      break;
    }
    case "effect": {
      const q = quoteOf(item, words, range);
      if (item.kind === "PUNCH_IN" || item.kind === "ZOOM_EMPHASIS") {
        const zoom = item.kind === "ZOOM_EMPHASIS" ? item.toZoom : item.zoom;
        lines.push(`Zoom ${finite(zoom).toFixed(2)}× from ${fmtTcShort(r?.outIn)} to ${fmtTcShort(r?.outOut)}${q ? ` — emphasis on “${q}”` : ""}.`);
      } else if (item.kind === "JUMP_ZOOM") {
        lines.push(item.reason || `Hides a jump cut at ${fmtTcShort(r?.outIn)} · punch-in covers the cut.`);
      } else {
        lines.push(item.reason || `${capFirst(String(item.kind).toLowerCase().replace(/_/g, " "))} at ${fmtTcShort(r?.outIn)}.`);
      }
      break;
    }
    case "cut": {
      const tm = r?.outIn ?? 0;
      if (item.kind === "SILENCE") {
        const pads = finite(item.snap?.padIn) + finite(item.snap?.padOut);
        lines.push(`${(finite(item.srcOut) - finite(item.srcIn)).toFixed(1)}s of silence removed at source ${fmtTcShort(item.srcIn)}${pads > 0 ? ` · keeps a ${num2(pads)}s breath` : ""}.`);
      } else if (item.kind === "FILLER") {
        const w = trimPunct(quoteOf(item, words, range)).toLowerCase() || "filler";
        lines.push(item.enabled === false && !item.userToggled ? `“${w}” kept — cut it to tighten the line.` : `“${w}” removed at ${fmtTcShort(tm)}.`);
      } else if (item.kind === "REPEAT" || item.kind === "FALSE_START" || item.kind === "RETAKE") {
        const q = quoteOf(item, words, range);
        lines.push(`Removed a ${item.kind === "RETAKE" ? "retake" : "repeated start"}${q ? ` (“${q}”)` : ""}.`);
      } else {
        lines.push(item.reason || `Cut at source ${fmtTcShort(item.srcIn)}.`);
      }
      break;
    }
    case "music": {
      const dur = outDuration(plan);
      const title = item.track?.title ? `“${item.track.title}”` : "Music";
      const parts = [title];
      if (item.track?.mood) parts.push(item.track.mood);
      parts.push(`plays ${fmtTcShort(0)}–${fmtTcShort(dur)}`);
      lines.push(`${parts.join(" · ")}${item.duck?.enabled ? " · ducks under your voice" : ""}.`);
      if (item.volume) lines.push(`Volume ${gainToDb(item.volume)} dB.`);
      break;
    }
    case "sfx": {
      const target = item.anchor?.elementId;
      const b = target && findItem(plan, "broll", target);
      const g = target && findItem(plan, "graphic", target);
      const cue = capFirst(item.cue || "Sound");
      if (b) lines.push(`${cue} on B-roll #${b.ordinal} ${item.anchor.edge === "out" ? "exit" : "entrance"}.`);
      else if (g) lines.push(`${cue} as the ${GRAPHIC_WORDS[g.kind] || "graphic"} ${item.anchor.edge === "out" ? "leaves" : "lands"}.`);
      else lines.push(item.reason || `${cue} at ${fmtTcShort(item.resolved?.outAt)}.`);
      break;
    }
    case "logo":
      lines.push(`${CORNER_WORDS[item.placement] || "Corner"} · ${Math.round(finite(item.scale) * 100)}% width · ${Math.round(finite(item.opacity) * 100)}% opacity · ${item.show === "intro_outro" ? "intro and outro" : "whole video"}.`);
      break;
    case "graphic": {
      const n = sentenceNumber(transcript, item.evidence?.sentenceId);
      const title = item.text?.title ? `“${item.text.title}”` : "";
      lines.push(`${capFirst(GRAPHIC_WORDS[item.kind] || "graphic")}${n ? ` on line ${n}` : ""}${title ? `: ${title}` : ""}.`);
      if (item.reason) lines.push(item.reason);
      break;
    }
    case "segment":
      if (item.faceRequired) lines.push("Speaker stays on screen — this line reads as a sincere moment.");
      else lines.push(`${capFirst(String(item.label || item.type || "Shot").toLowerCase())} · ${fmtTcShort(r?.outIn)}–${fmtTcShort(r?.outOut)}.`);
      break;
    default:
      if (item.reason) lines.push(item.reason);
  }
  if (userLine) lines.push(userLine);
  return lines;
}

export const provenanceLine = (ref, plan, transcript) => provenanceLines(ref, plan, transcript)[0] || "";

// "B-ROLL #3 · 00:12–00:15 · FULL" — the item-card head.
export function itemHead(ref, plan) {
  const item = ref?.item || findItem(plan, ref?.kind, ref?.id);
  if (!item) return "";
  const r = itemRange(plan, ref.kind, item);
  const span = r ? (r.outOut > r.outIn ? `${fmtTcShort(r.outIn)}–${fmtTcShort(r.outOut)}` : fmtTcShort(r.outIn)) : "";
  switch (ref.kind) {
    case "broll": return [`B-ROLL #${item.ordinal}`, span, item.layout].filter(Boolean).join(" · ");
    case "caption": return ["CAPTION", span].filter(Boolean).join(" · ");
    case "effect": return [String(item.kind).replace(/_/g, "-"), span].filter(Boolean).join(" · ");
    case "graphic": return [String(item.kind).replace(/_/g, " "), span].filter(Boolean).join(" · ");
    case "cut": return [`${item.kind} CUT`, span].filter(Boolean).join(" · ");
    case "sfx": return [`SFX · ${String(item.cue).toUpperCase()}`, span].filter(Boolean).join(" · ");
    case "music": return "MUSIC";
    case "logo": return "LOGO";
    case "segment": return [SEGMENT_LABELS[item.type] || item.type, span].filter(Boolean).join(" · ");
    default: return span;
  }
}

export const LANGUAGE_OPTIONS = Object.freeze(LANGUAGES.map((l) => ({ value: l.code, label: `${l.name} — ${l.native}`, dir: l.dir })));
