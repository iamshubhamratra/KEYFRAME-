// VIDEO EDIT FACE TRACK SMOOTHING — sparse vision boxes → one stable, normalized primary-face track (ANALYSIS.md §6).
//
// WHY THIS EXISTS. ve_faces returns at most 24 boxes for a whole video, from a model that occasionally
// nests a box (`box_2d:[[…]]`), returns a box for a poster on the wall, jitters on a profile, or misses a
// frame. Framing (director/framing.js), crop math (plan/resolve.js, plan/timeline.faceAt) and caption face
// avoidance consume the track as keyframes {t, cx, cy, h} that they INTERPOLATE linearly — so one bad box
// becomes a visible whip-pan in the export. This module is the gate between the model and that math:
//   1. validate + clamp every box (head height 3–70 % of the frame, pixel w/h 0.55–1.5);
//   2. pick ONE primary face per frame: the largest `speaker` box, preferring IoU > 0.2 continuity with the
//      previous primary in the same shot (a lone valid face counts when no box is labelled speaker);
//   3. split into shots at scene changes (a cut is a legitimate jump; nothing smooths or interpolates across it);
//   4. Hampel filter (window 5, 3 × scaled MAD) on cx, cy, h inside each shot;
//   5. gaps ≤ 6 s inside a shot are bridged (the consumers interpolate between keyframes); longer gaps and shots
//      with no detection become `absent` ranges, where consumers fall back to the default centre framing;
//   6. at every scene change a hold keyframe just before the cut and a fresh one at the cut, so linear
//      interpolation never drifts across the cut.
// Pure and deterministic.
//
// CONTRACT:
//   flattenBox(raw) -> [ymin, xmin, ymax, xmax] (numbers, 0..1000 scale) | null      (nested [[…]] / numeric strings)
//   validateBox(raw, { frameW, frameH }) -> { ok, reason, box:{x0,y0,x1,y1} (0..1), cx, cy, h, w }
//   iou(a, b) (normalized {x0,y0,x1,y1})
//   hampel(values, { window=5, k=3 }) -> { values, outliers:[index] }
//   smoothTrack({ frames:[{ t, faces:[{box_2d, role, facing}] }], sceneChanges:[t], durationSec, frameW, frameH, opts })
//     -> { mode:'tracked'|'assumed', keyframes:[{t,cx,cy,h}], absent:[{start,end}], multiFace:[{start,end}],
//          primary:[{t, cx, cy, h, w, facing, interpolated:false, outlier}], stats:{ frames, detections, invalidBoxes, outliers } }
//   TRACK_DEFAULTS

const TRACK_DEFAULTS = Object.freeze({
  minH: 0.03, maxH: 0.7, minAspect: 0.55, maxAspect: 1.5, iouContinuity: 0.2,
  hampelWindow: 5, hampelK: 3, maxGapSec: 6, cutEpsSec: 0.001, minRangeSec: 0.05,
});

const r4 = (x) => Math.round(x * 10000) / 10000;
const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function flattenBox(raw) {
  let b = raw;
  for (let depth = 0; depth < 4 && Array.isArray(b) && b.length === 1 && Array.isArray(b[0]); depth++) b = b[0];
  if (isPlain(b) && Array.isArray(b.box_2d)) return flattenBox(b.box_2d);
  if (!Array.isArray(b)) return null;
  // [[ymin,xmin],[ymax,xmax]] pairs and [[y,x,y,x]] single nests both occur; flatten one level of numbers.
  const flat = b.flat(3);
  if (flat.length !== 4) return null;
  const nums = flat.map((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v));
  if (!nums.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return nums;
}

function validateBox(raw, { frameW = 1, frameH = 1, opts = {} } = {}) {
  const o = { ...TRACK_DEFAULTS, ...opts };
  const flat = flattenBox(raw);
  if (!flat) return { ok: false, reason: "shape" };
  let [y0, x0, y1, x1] = flat.map((v) => clamp(v, 0, 1000) / 1000);
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (x1 < x0) [x0, x1] = [x1, x0];
  const h = y1 - y0;
  const w = x1 - x0;
  if (!(h > 0) || !(w > 0)) return { ok: false, reason: "empty" };
  if (h < o.minH) return { ok: false, reason: "too_small" };
  if (h > o.maxH) return { ok: false, reason: "too_large" };
  const W = Number(frameW) > 0 ? Number(frameW) : 1;
  const H = Number(frameH) > 0 ? Number(frameH) : 1;
  const aspect = (w * W) / (h * H);
  if (aspect < o.minAspect || aspect > o.maxAspect) return { ok: false, reason: "aspect" };
  return { ok: true, reason: null, box: { x0, y0, x1, y1 }, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h, w };
}

function iou(a, b) {
  if (!a || !b) return 0;
  const iw = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const ih = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = iw * ih;
  const union = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return union > 0 ? inter / union : 0;
}

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// Hampel: a point further than k × 1.4826 × MAD from its window median is replaced by that median.
// A near-zero MAD (a perfectly steady shot) gets a small floor so float noise is never an "outlier".
function hampel(values, { window = TRACK_DEFAULTS.hampelWindow, k = TRACK_DEFAULTS.hampelK, floor = 0.004 } = {}) {
  const half = Math.max(1, Math.floor(window / 2));
  const out = values.slice();
  const outliers = [];
  if (values.length < 3) return { values: out, outliers };
  for (let i = 0; i < values.length; i++) {
    const win = values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1));
    if (win.length < 3) continue;
    const med = median(win);
    const mad = median(win.map((v) => Math.abs(v - med)));
    const scale = Math.max(floor, 1.4826 * mad);
    if (Math.abs(values[i] - med) > k * scale) { out[i] = med; outliers.push(i); }
  }
  return { values: out, outliers };
}

function mergeRanges(ranges, minLen = 0) {
  const s = ranges.filter((r) => r && r.end > r.start).sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 1e-6) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out.filter((r) => r.end - r.start >= minLen - 1e-9).map((r) => ({ start: r3(r.start), end: r3(r.end) }));
}

function smoothTrack({ frames = [], sceneChanges = [], durationSec = null, frameW = 1, frameH = 1, opts = {} } = {}) {
  const o = { ...TRACK_DEFAULTS, ...opts };
  const list = (Array.isArray(frames) ? frames : [])
    .filter((f) => isPlain(f) && Number.isFinite(Number(f.t)))
    .map((f) => ({ ...f, t: Number(f.t) }))
    .sort((a, b) => a.t - b.t);
  const lastT = list.length ? list[list.length - 1].t : 0;
  const D = Number(durationSec) > 0 ? Number(durationSec) : lastT;
  const cuts = [...new Set((Array.isArray(sceneChanges) ? sceneChanges : [])
    .map((c) => Number(isPlain(c) ? c.t : c)).filter((t) => Number.isFinite(t) && t > 0 && t < D))].sort((a, b) => a - b);
  const shotOf = (t) => { let k = 0; while (k < cuts.length && t >= cuts[k] - 1e-9) k++; return k; };
  const shotBounds = (k) => ({ start: k === 0 ? 0 : cuts[k - 1], end: k < cuts.length ? cuts[k] : D });

  const stats = { frames: list.length, detections: 0, invalidBoxes: 0, boxes: 0, outliers: 0 };
  const multi = [];
  const perFrame = [];
  let prev = null;
  let prevShot = -1;

  const halfStep = (i) => {
    const a = i > 0 ? (list[i].t - list[i - 1].t) / 2 : 0.5;
    const b = i + 1 < list.length ? (list[i + 1].t - list[i].t) / 2 : 0.5;
    return { a: Math.min(a, 1.5), b: Math.min(b, 1.5) };
  };

  list.forEach((f, i) => {
    const shot = shotOf(f.t);
    if (shot !== prevShot) { prev = null; prevShot = shot; }
    const valid = [];
    for (const face of Array.isArray(f.faces) ? f.faces : []) {
      if (!isPlain(face) && !Array.isArray(face)) continue;
      stats.boxes++;
      const v = validateBox(isPlain(face) ? face.box_2d : face, { frameW, frameH, opts: o });
      if (!v.ok) { stats.invalidBoxes++; continue; }
      valid.push({ ...v, role: isPlain(face) && face.role === "speaker" ? "speaker" : (isPlain(face) && face.role ? String(face.role) : "other"), facing: isPlain(face) ? face.facing || null : null });
    }
    if (valid.length >= 2) {
      const hs = halfStep(i);
      multi.push({ start: Math.max(0, f.t - hs.a), end: Math.min(D, f.t + hs.b) });
    }
    let pool = valid.filter((v) => v.role === "speaker");
    if (!pool.length && valid.length === 1) pool = valid;
    let pick = null;
    if (pool.length) {
      if (prev) {
        const cont = pool.filter((v) => iou(v.box, prev.box) > o.iouContinuity);
        if (cont.length) pick = cont.sort((a, b) => iou(b.box, prev.box) - iou(a.box, prev.box) || b.h * b.w - a.h * a.w)[0];
      }
      if (!pick) pick = pool.slice().sort((a, b) => b.h * b.w - a.h * a.w)[0];
    }
    if (pick) { prev = pick; stats.detections++; }
    perFrame.push({ t: f.t, shot, pick });
  });

  if (!stats.detections) {
    return { mode: "assumed", keyframes: [], absent: [], multiFace: mergeRanges(multi, o.minRangeSec), primary: [], stats };
  }

  // Hampel per shot on the detections only.
  const byShot = new Map();
  for (const p of perFrame) {
    if (!p.pick) continue;
    if (!byShot.has(p.shot)) byShot.set(p.shot, []);
    byShot.get(p.shot).push(p);
  }
  const primary = [];
  for (const [, dets] of [...byShot.entries()].sort((a, b) => a[0] - b[0])) {
    const cx = hampel(dets.map((d) => d.pick.cx), { window: o.hampelWindow, k: o.hampelK });
    const cy = hampel(dets.map((d) => d.pick.cy), { window: o.hampelWindow, k: o.hampelK });
    const hh = hampel(dets.map((d) => d.pick.h), { window: o.hampelWindow, k: o.hampelK, floor: 0.003 });
    dets.forEach((d, k) => {
      const outlier = cx.outliers.includes(k) || cy.outliers.includes(k) || hh.outliers.includes(k);
      if (outlier) stats.outliers++;
      primary.push({ t: r3(d.t), shot: d.shot, cx: r4(cx.values[k]), cy: r4(cy.values[k]), h: r4(hh.values[k]), w: r4(d.pick.w), facing: d.pick.facing, outlier });
    });
  }

  // Keyframes and absent ranges, shot by shot.
  const keyframes = [];
  const absent = [];
  const shots = cuts.length + 1;
  const kf = (t, p) => keyframes.push({ t: r3(t), cx: p.cx, cy: p.cy, h: p.h });
  for (let s = 0; s < shots; s++) {
    const { start, end } = shotBounds(s);
    if (end - start <= 1e-6) continue;
    const dets = primary.filter((p) => p.shot === s);
    if (!dets.length) { absent.push({ start, end }); continue; }
    const first = dets[0];
    const last = dets[dets.length - 1];
    // Head of the shot: hold the first detection back to the cut when it is close enough, else absent until it.
    if (first.t - start > o.maxGapSec) absent.push({ start, end: first.t });
    else if (s > 0 || first.t > start + 1e-6) kf(start, first);
    for (let k = 0; k < dets.length; k++) {
      const d = dets[k];
      kf(d.t, d);
      const next = dets[k + 1];
      if (next && next.t - d.t > o.maxGapSec) {
        // Missing frames between two far-apart detections: the face is gone for that stretch.
        const missing = perFrame.filter((p) => p.shot === s && !p.pick && p.t > d.t && p.t < next.t);
        const a = missing.length ? missing[0].t : d.t + (next.t - d.t) / 2;
        absent.push({ start: a, end: next.t });
        kf(a - o.cutEpsSec, d);
      }
    }
    // Tail: hold the last detection to the end of the shot (or mark absent when it is too far).
    if (end - last.t > o.maxGapSec) {
      const missing = perFrame.filter((p) => p.shot === s && !p.pick && p.t > last.t);
      const a = missing.length ? missing[0].t : last.t + o.maxGapSec;
      absent.push({ start: Math.min(a, end), end });
      kf(Math.min(a, end) - o.cutEpsSec, last);
    } else if (s < shots - 1) {
      kf(end - o.cutEpsSec, last);
    } else if (end - last.t > 1e-6) {
      kf(end, last);
    }
  }
  const dedup = [];
  for (const k of keyframes.sort((a, b) => a.t - b.t)) {
    const l = dedup[dedup.length - 1];
    if (l && Math.abs(l.t - k.t) < 1e-9) dedup[dedup.length - 1] = k;
    else if (k.t >= 0 && k.t <= D + 1e-6) dedup.push(k);
  }
  return {
    mode: "tracked",
    keyframes: dedup,
    absent: mergeRanges(absent, o.minRangeSec),
    multiFace: mergeRanges(multi, o.minRangeSec),
    primary: primary.map(({ shot, ...rest }) => rest),
    stats,
  };
}

module.exports = { flattenBox, validateBox, iou, hampel, median, mergeRanges, smoothTrack, TRACK_DEFAULTS };
