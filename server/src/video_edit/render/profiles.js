// VIDEO EDIT RENDER PROFILES — output sizes and encoder settings per render profile (RENDER.md §1).
//
// WHY THIS EXISTS. A preview and an export are built from the SAME composition; only the output size, the encoder
// presets, the ASS PlayRes and the conform sizes differ. Every module that touches pixels (compose, aroll,
// composite, conform, cards) must agree on those numbers, or a caption placed for the preview lands somewhere else
// in the export. Crop rectangles stay in mezzanine pixels and are shared by all profiles; everything measured in
// output pixels is derived from `outputFor(profile, aspect)`.
//
// CONTRACT (pure):
//   PROFILES · PROFILE_NAMES · KINDS ('preview'|'export')
//   getProfile(name) -> profile (throws EditError INVALID_PROFILE 422)
//   outputFor(name, aspect) -> { w, h }   short edge = profile.short; 9:16 / 16:9 / 1:1
//   defaultProfileFor(kind, settings?) -> 'preview540' | settings.exportProfile | 'export1080'
//   scaleFor(name) -> short edge / 1080   (reference size of styles, cards and PIP masks)
//   ENCODE_COMMON · COLOR_ARGS
//   UPSCALE_CAP (2) · needsFit({ w, h } mezz, aspect, background) -> boolean   (decided at the 1080 reference so
//     preview and export agree: 'blur' background, or a cover crop that would upscale more than UPSCALE_CAP)
//   fitPlacement(mezz, out) -> { s, x, y, w, h }   where the fitted frame lands in the output (force_original_aspect_ratio
//     =decrease, centred — the same geometry as exprs.blurFillFilter)
//   SAFE_AREAS[aspect] = { top, bottom, side } — fractions of the output kept clear of platform UI (TikTok/Reels/
//     Shorts chrome); text (captions, cards) must sit inside. Shared by compose (card placement) and qa/checks.

const { EditError } = require("../errors");

const FPS = 30;
const PROFILES = Object.freeze({
  preview540: Object.freeze({ name: "preview540", short: 540, inter: Object.freeze({ preset: "ultrafast", crf: 20 }), final: Object.freeze({ preset: "ultrafast", crf: 30 }), cards: "fallback" }),
  export720: Object.freeze({ name: "export720", short: 720, inter: Object.freeze({ preset: "ultrafast", crf: 14 }), final: Object.freeze({ preset: "veryfast", crf: 21 }), cards: "hyperframes" }),
  export1080: Object.freeze({ name: "export1080", short: 1080, inter: Object.freeze({ preset: "ultrafast", crf: 12 }), final: Object.freeze({ preset: "veryfast", crf: 20 }), cards: "hyperframes" }),
});
const PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));
const KINDS = Object.freeze(["preview", "export"]);
const ASPECTS = Object.freeze({ "9:16": [9, 16], "16:9": [16, 9], "1:1": [1, 1] });
const SAFE_AREAS = Object.freeze({
  "9:16": Object.freeze({ top: 0.12, bottom: 0.20, side: 0.06 }),
  "16:9": Object.freeze({ top: 0.05, bottom: 0.05, side: 0.05 }),
  "1:1": Object.freeze({ top: 0.05, bottom: 0.05, side: 0.05 }),
});

const COLOR_ARGS = Object.freeze(["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]);
// Every intermediate and final shares these so the concat demuxer can stream-copy chunks (spike S2).
const ENCODE_COMMON = Object.freeze(["-pix_fmt", "yuv420p", ...COLOR_ARGS, "-r", String(FPS), "-video_track_timescale", "30000", "-bf", "0"]);

function getProfile(name) {
  const p = PROFILES[name];
  if (!p) throw new EditError("INVALID_PROFILE", { status: 422, errorClass: "input", extra: { profile: String(name).slice(0, 20) } });
  return p;
}

function outputFor(name, aspect) {
  const p = getProfile(name);
  const r = ASPECTS[aspect] || ASPECTS["9:16"];
  const long = Math.round((p.short * Math.max(r[0], r[1])) / Math.min(r[0], r[1]) / 2) * 2;
  return r[0] <= r[1] ? { w: p.short, h: long } : { w: long, h: p.short };
}

function defaultProfileFor(kind, settings = null) {
  if (kind === "preview") return "preview540";
  const want = settings && settings.exportProfile;
  return want && PROFILES[want] && want !== "preview540" ? want : "export1080";
}

function scaleFor(name) { return getProfile(name).short / 1080; }

const UPSCALE_CAP = 2.0;
function needsFit(mezz, aspect, background) {
  if (background === "blur") return true;
  if (!mezz || !(mezz.w > 0) || !(mezz.h > 0)) return false;
  const ref = outputFor("export1080", aspect);
  const A = ref.w / ref.h;
  const bh = Math.min(mezz.w, mezz.h * A) / A;
  return ref.h / bh > UPSCALE_CAP + 1e-9;
}
function fitPlacement(mezz, out) {
  const s = Math.min(out.w / mezz.w, out.h / mezz.h);
  const w = mezz.w * s, h = mezz.h * s;
  return { s, x: (out.w - w) / 2, y: (out.h - h) / 2, w, h };
}

module.exports = { PROFILES, PROFILE_NAMES, KINDS, ASPECTS, SAFE_AREAS, UPSCALE_CAP, needsFit, fitPlacement, FPS, COLOR_ARGS, ENCODE_COMMON, getProfile, outputFor, defaultProfileFor, scaleFor };
