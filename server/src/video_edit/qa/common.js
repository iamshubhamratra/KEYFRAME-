// VIDEO EDIT QA COMMON — the QA vocabulary (categories, severities, classes) and the one finding shape.
//
// WHY THIS EXISTS. Deterministic checks, the vision pass, the repair planner and the verdict all speak
// about the same findings. If each module spelled a category or a severity on its own, a typo would
// silently fall out of the repair mapping (an unrepaired blocker) or out of the score. So the enum lives
// here once (ENGINE.md §7 `QaCategory`, deterministic-only categories included), every finding is built
// by `makeFinding` (clamped, truncated, class defaulted), and the repair totality test iterates this list.
//
// CONTRACT:
//   QA_CATEGORIES (frozen array, ENGINE.md §7 order) · SEVERITIES · CLASSES · SEVERITY_RANK · FPS · FRAME_SEC
//   makeFinding({ severity, cls='Q', category, area, atSec, elementId?, detail, fix?, data?, source='check' })
//     -> { severity, class, category, area, atSec, elementId, detail, fix, data, source }
//     Throws a plain Error on an unknown category / severity / class (a programming error, caught by tests).
//   sortFindings(list) -> new array (blocker > major > minor, class I first, then time)
//   mergeRanges([[a,b]], gap=0) -> merged sorted ranges · overlapSec(a0,a1,b0,b1) · r3(x) · clamp(v,lo,hi) · isPlain(v)
//   Findings carry no transcript text and no file names: `detail` is written by our code from numbers and ids.

const QA_CATEGORIES = Object.freeze([
  "CAPTION_UNREADABLE", "CAPTION_MISMATCH", "CAPTION_COVERS_FACE", "OVERLAY_COLLISION", "TEXT_OFFSCREEN",
  "BROLL_OFF_TOPIC", "BROLL_LOW_QUALITY", "BROLL_WATERMARK", "SPEAKER_CROPPED", "BLACK_OR_BLANK_FRAME", "CARD_RENDER_BROKEN",
  "LOGO_PROBLEM", "EXPOSURE_OR_COLOR_JUMP", "OTHER",
  "DURATION_MISMATCH", "LOUDNESS", "SILENCE", "FREEZE", "CLIPPED_WORD", "AWKWARD_CUT", "CAPTION_TIMING", "COVERAGE",
  "EFFECT_DENSITY", "ASSET_BROKEN", "AV_OFFSET", "CARD_COVERS_FACE",
]);
const SEVERITIES = Object.freeze(["blocker", "major", "minor"]);
const CLASSES = Object.freeze(["I", "Q"]);
const SEVERITY_RANK = Object.freeze({ blocker: 0, major: 1, minor: 2 });
const FPS = 30;
const FRAME_SEC = 1 / FPS;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clip = (s, max) => (s == null ? null : String(s).replace(/\s+/g, " ").trim().slice(0, max) || null);

function makeFinding({ severity, cls = "Q", category, area, atSec = null, elementId = null, detail, fix = null, data = null, source = "check" } = {}) {
  if (!QA_CATEGORIES.includes(category)) throw new Error(`qa: unknown category ${category}`);
  if (!SEVERITIES.includes(severity)) throw new Error(`qa: unknown severity ${severity}`);
  if (!CLASSES.includes(cls)) throw new Error(`qa: unknown class ${cls}`);
  return {
    severity, class: cls, category, area: clip(area, 40) || "general",
    atSec: Number.isFinite(atSec) ? r3(Math.max(0, atSec)) : null,
    elementId: elementId == null ? null : String(elementId).slice(0, 60),
    detail: clip(detail, 240) || category, fix: clip(fix, 200),
    data: isPlain(data) ? data : null, source,
  };
}

function sortFindings(list) {
  return (Array.isArray(list) ? list : []).slice().sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || (a.class === b.class ? 0 : a.class === "I" ? -1 : 1)
    || (a.atSec == null ? 1e9 : a.atSec) - (b.atSec == null ? 1e9 : b.atSec));
}

function mergeRanges(ranges, gap = 0) {
  const list = (Array.isArray(ranges) ? ranges : [])
    .filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] >= r[0])
    .map((r) => [r[0], r[1]]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of list) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + gap) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

function overlapSec(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

module.exports = {
  QA_CATEGORIES, SEVERITIES, CLASSES, SEVERITY_RANK, FPS, FRAME_SEC,
  makeFinding, sortFindings, mergeRanges, overlapSec, r3, clamp, isPlain,
};
