// VIDEO EDIT CAPTION PLACEMENT — where each cue sits on screen (RENDER.md §6 "Placement").
//
// WHY THIS EXISTS. A caption on the speaker's mouth is the most visible defect a talking-head edit
// can ship (QA major: caption ∩ face > 10 %), and a caption under the platform's UI chrome is
// invisible. But a caption that jumps every second is worse than either. So placement is a small
// deterministic policy: per-aspect safe bands, face and overlay avoidance, the SPLIT seam, per-cue
// user overrides that always win inside the band — and hysteresis, so the position changes at most
// once per 4 s unless the change is forced (entering or leaving the seam, override, overlay collision, the
// current band covering more than 30 % of the cue box with the face, or any other held position covering
// more than 10 % with the face or an overlay).
//
// CONTRACT:
//   placeCues(cues, { faceTrackOut, overlays, style, output, splitRanges, fullBrollRanges, policy='auto',
//             faceAvoid=true, yOverride, cueY={}, lang, hysteresisSec=4 }) -> new Cue[] with pos {x, y, an}
//     faceTrackOut: [{ t:outSec, cx, cy, h, w? }] normalized to the OUTPUT frame, or null (no avoidance)
//     overlays: [{ outIn, outOut, box:{ x, y, w, h } }] normalized; split/fullBrollRanges: [{ outIn, outOut }]
//     pos.y is the anchor line in 0..1 of output height; an 2 = bottom-anchored, 8 = top, 5 = centre.
//   bandsFor(aspect) -> { bottom:{y,an}, top:{y,an}, center:{y,an}, min, max }
//   clampY(y, aspect) · cueBox(cue, style, output, pos, lang) · overlapFrac(a, b)

const { measureText } = require("./group");

const SAFE_BANDS = Object.freeze({
  // 9:16: bottom caption baseline at 72 % (never below 80 %), top 12 % reserved for platform UI.
  "9:16": Object.freeze({ bottom: Object.freeze({ y: 0.72, an: 2 }), top: Object.freeze({ y: 0.14, an: 8 }), center: Object.freeze({ y: 0.5, an: 5 }), min: 0.14, max: 0.8 }),
  // 16:9: bottom 8–15 %.
  "16:9": Object.freeze({ bottom: Object.freeze({ y: 0.9, an: 2 }), top: Object.freeze({ y: 0.08, an: 8 }), center: Object.freeze({ y: 0.5, an: 5 }), min: 0.08, max: 0.92 }),
  // 1:1: bottom 12–20 %.
  "1:1": Object.freeze({ bottom: Object.freeze({ y: 0.84, an: 2 }), top: Object.freeze({ y: 0.1, an: 8 }), center: Object.freeze({ y: 0.5, an: 5 }), min: 0.1, max: 0.88 }),
});
const FACE_OVERLAP_MOVE = 0.1;
const FACE_OVERLAP_FORCE = 0.3;
const TIME_OVERLAP_FRACTION = 0.5;

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function bandsFor(aspect) { return SAFE_BANDS[aspect] || SAFE_BANDS["9:16"]; }

function clampY(y, aspect) {
  const b = bandsFor(aspect);
  return clamp(Number(y), b.min, b.max);
}

function cueBox(cue, style, output, pos, lang) {
  const W = output.width, H = output.height;
  const lines = cue.lines && cue.lines.length ? cue.lines : [cue.text || ""];
  const widest = Math.max(...lines.map((l) => measureText(l, style, lang || style.lang)));
  const w = Math.min(1, widest / W);
  const h = Math.min(1, (lines.length * style.font.sizePx * style.font.lineHeight) / H);
  const x = 0.5 - w / 2;
  let y;
  if (pos.an === 8) y = pos.y;
  else if (pos.an === 5) y = pos.y - h / 2;
  else y = pos.y - h;
  return { x, y, w, h };
}

function overlapFrac(a, b) {
  if (!a || !b || a.w <= 0 || a.h <= 0) return 0;
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / (a.w * a.h);
}

function timeOverlap(cue, r) {
  const a = cue.resolved ? cue.resolved.outIn : 0, b = cue.resolved ? cue.resolved.outOut : 0;
  const inter = Math.max(0, Math.min(b, r.outOut) - Math.max(a, r.outIn));
  return b > a ? inter / (b - a) : 0;
}

function faceBoxAt(track, t, output) {
  if (!track || !track.length) return null;
  let a = track[0], b = track[track.length - 1];
  let f;
  if (t <= a.t) f = a;
  else if (t >= b.t) f = b;
  else {
    let lo = 0, hi = track.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (track[m].t <= t) lo = m; else hi = m; }
    a = track[lo]; b = track[hi];
    const u = (t - a.t) / ((b.t - a.t) || 1);
    const lerp = (k) => (Number.isFinite(a[k]) && Number.isFinite(b[k]) ? a[k] + (b[k] - a[k]) * u : a[k]);
    f = { cx: lerp("cx"), cy: lerp("cy"), h: lerp("h"), w: lerp("w") };
  }
  if (!f || f.absent) return null;
  const h = f.h;
  const w = Number.isFinite(f.w) ? f.w : (h * 0.8 * output.height) / output.width;
  return { x: f.cx - w / 2, y: f.cy - h / 2, w, h };
}

function faceBoxOverCue(track, cue, output) {
  if (!track || !cue.resolved) return null;
  const { outIn, outOut } = cue.resolved;
  const boxes = [outIn, (outIn + outOut) / 2, outOut].map((t) => faceBoxAt(track, t, output)).filter(Boolean);
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const samePos = (a, b) => !!a && !!b && a.an === b.an && Math.abs(a.y - b.y) < 1e-6;

function placeCues(cues, opts = {}) {
  const {
    faceTrackOut = null, overlays = [], style, output, splitRanges = [], fullBrollRanges = [],
    policy = "auto", faceAvoid = true, yOverride = undefined, cueY = {}, lang, hysteresisSec = 4,
  } = opts;
  const aspect = style && style.aspect ? style.aspect : "9:16";
  const bands = bandsFor(aspect);
  const track = Array.isArray(faceTrackOut) ? faceTrackOut.slice().sort((a, b) => a.t - b.t) : null;
  const L = lang || (style && style.lang) || "en";

  let current = null;
  let currentIsSeam = false;
  let lastChangeAt = -Infinity;

  return (cues || []).map((cue) => {
    const t0 = cue.resolved ? cue.resolved.outIn : 0;
    const pinY = cueY && Object.prototype.hasOwnProperty.call(cueY, cue.id) ? cueY[cue.id] : yOverride;
    let desired, forced = false, seam = false;

    if (Number.isFinite(pinY)) {
      // A user pin applies to this cue only: it never becomes the hysteresis state of its neighbours.
      const y = clampY(pinY, aspect);
      return { ...cue, pos: { x: 0.5, y: r4(y), an: y >= 0.5 ? 2 : 8 } };
    } else if (policy === "top" || policy === "center" || policy === "bottom") {
      desired = { ...bands[policy] };
      forced = true;
    } else if (aspect === "9:16" && splitRanges.some((r) => timeOverlap(cue, r) >= TIME_OVERLAP_FRACTION)) {
      desired = { y: 0.5, an: 5 };
      forced = true;
      seam = true;
    } else {
      const underFull = fullBrollRanges.some((r) => timeOverlap(cue, r) >= TIME_OVERLAP_FRACTION);
      const face = !underFull && faceAvoid ? faceBoxOverCue(track, cue, output) : null;
      const live = (overlays || []).filter((o) => o && o.box && Math.min(o.outOut, cue.resolved.outOut) - Math.max(o.outIn, cue.resolved.outIn) > 0);
      const score = (band) => {
        const box = cueBox(cue, style, output, band, L);
        return { face: face ? overlapFrac(box, face) : 0, overlay: Math.max(0, ...live.map((o) => overlapFrac(box, o.box))) };
      };
      const bottom = score(bands.bottom), top = score(bands.top);
      desired = { ...bands.bottom };
      if (bottom.face > FACE_OVERLAP_MOVE && top.face < bottom.face) desired = { ...bands.top };
      const chosen = desired.an === 8 ? top : bottom;
      const other = desired.an === 8 ? bottom : top;
      if (chosen.overlay > FACE_OVERLAP_MOVE && other.overlay < chosen.overlay && other.face <= FACE_OVERLAP_MOVE) {
        desired = desired.an === 8 ? { ...bands.bottom } : { ...bands.top };
        forced = true;
      }
      if (current && !forced && !samePos(current, desired)) {
        if (currentIsSeam) forced = true;            // the seam only exists while the SPLIT is on screen
        else if (samePos(current, bands.top) || samePos(current, bands.bottom)) {
          const cur = samePos(current, bands.top) ? top : bottom;
          if (cur.face > FACE_OVERLAP_FORCE || cur.overlay > FACE_OVERLAP_MOVE) forced = true;
        } else {
          // any other held position (centre…) has no hysteresis credit when it covers the face or an overlay
          const cur = score(current);
          if (cur.face > FACE_OVERLAP_MOVE || cur.overlay > FACE_OVERLAP_MOVE) forced = true;
        }
      }
    }

    let pos = desired;
    if (current && !samePos(current, desired) && !cue.hidden) {
      if (forced || t0 - lastChangeAt >= hysteresisSec - 1e-9) lastChangeAt = t0;
      else pos = current;
    }
    if (!cue.hidden) { current = pos; currentIsSeam = seam && pos === desired; }
    return { ...cue, pos: { x: 0.5, y: r4(pos.y), an: pos.an } };
  });
}

module.exports = { placeCues, bandsFor, clampY, cueBox, overlapFrac, faceBoxAt, SAFE_BANDS, FACE_OVERLAP_MOVE, FACE_OVERLAP_FORCE };
