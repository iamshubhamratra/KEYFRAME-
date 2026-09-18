// VIDEO EDIT SEGMENT FRAMING — where the A-roll crop sits inside each segment (EDIT_PLAN.md §3.11, RENDER.md §4).
//
// WHY THIS EXISTS. Every output aspect other than the source's needs a crop, and a crop that chases
// every jitter of the face tracker looks like a nervous camera operator, while a crop that never moves
// loses a speaker who leans out of frame. The contract is a dead zone: the framing moves only when the
// face leaves ±12 % of the crop width / ±8 % of its height around the current framing point, the move
// eases over 0.5 s, and the next move cannot start before the previous one lands. Headroom is enforced
// here (face top ≥ 8 % of the crop height below the crop top) so the renderer's single formula
// `y = cy·H − faceYTarget·h` never cuts a forehead. When the vision stage was skipped (faces
// `mode:'assumed'`) the framing is a static centre-weighted crop — never a guess that moves.
// Keyframes are normalised mezzanine coordinates, so one framing serves every render profile.
//
// CONTRACT (pure):
//   framingForSegments(segments, faces, { aspect='9:16', mezz:{w,h}, zoomBase=1 }) -> Framing[] (same order)
//     segments: [{ srcIn, srcOut, framing? }] or [{ anchor:{kind:'src', srcIn, srcOut}, framing? }];
//     a segment whose framing is locked keeps it unchanged.
//     Framing = { mode:'static'|'follow', zoomBase, keyframes:[{ src, cx, cy, zoom }], locked:false }
//     keyframe (cx, cy) is the mezzanine point placed at (0.5, faceYTarget) of the crop.
//   faceBoxAt(faces, srcT, { mezz }) -> { cx, cy, h, w|null, x|null, y, assumed, absent }
//     face box (normalised to the mezzanine) at a source time; assumed/absent return the default face.
//   framingTarget(face, { aspect, mezz, zoom }) -> { cx, cy } (headroom-corrected framing point)
//   DEAD_ZONE {x:0.12, y:0.08} · EASE_SEC 0.5 · HEADROOM 0.08 · MIN_MOVE_SEC 0.4

const { EditError } = require("../errors");
const T = require("../plan/timeline");

const DEAD_ZONE = Object.freeze({ x: 0.12, y: 0.08 });
const EASE_SEC = 0.5;
const MIN_MOVE_SEC = 0.4;
const HEADROOM = 0.08;
const ASPECT_RATIO = Object.freeze({ "9:16": 9 / 16, "16:9": 16 / 9, "1:1": 1 });

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function invalid(detail) {
  return new EditError("INVALID_FRAMING_INPUT", { status: 422, errorClass: "input", detail });
}

const isAssumed = (faces) => !faces || faces.mode === "assumed" || !Array.isArray(faces.keyframes) || !faces.keyframes.length;
const inAbsent = (faces, t) => !isAssumed(faces) && (faces.absent || []).some((r) => t >= r.start && t < r.end);

function faceBoxAt(faces, srcT, { mezz = null } = {}) {
  const assumed = isAssumed(faces);
  const absent = inAbsent(faces, srcT);
  const f = T.faceAt(faces, srcT);
  const w = mezz && mezz.w > 0 && mezz.h > 0 ? r6((0.8 * f.h * mezz.h) / mezz.w) : null;
  return { cx: r6(f.cx), cy: r6(f.cy), h: r6(f.h), w, x: w == null ? null : r6(f.cx - w / 2), y: r6(f.cy - f.h / 2), assumed, absent };
}

function cropGeom(aspect, mezz, zoom) {
  const A = ASPECT_RATIO[aspect] || ASPECT_RATIO["9:16"];
  const bw = Math.min(mezz.w, mezz.h * A);
  const bh = bw / A;
  return { W: mezz.w, H: mezz.h, w: bw / zoom, h: bh / zoom };
}

function framingTarget(face, { aspect = "9:16", mezz, zoom = 1 } = {}) {
  const g = cropGeom(aspect, mezz, zoom);
  const yTarget = T.FACE_Y_TARGET[aspect] != null ? T.FACE_Y_TARGET[aspect] : 0.4;
  let y = face.cy * g.H - yTarget * g.h;
  const faceTop = (face.cy - face.h / 2) * g.H;
  if (faceTop - y < HEADROOM * g.h) y = faceTop - HEADROOM * g.h;
  return { cx: r6(clamp(face.cx, 0, 1)), cy: r6(clamp((y + yTarget * g.h) / g.H, 0, 1)) };
}

function spanOf(seg) {
  if (seg && Number.isFinite(seg.srcIn) && Number.isFinite(seg.srcOut)) return [seg.srcIn, seg.srcOut];
  if (seg && seg.anchor && seg.anchor.kind === "src") return [seg.anchor.srcIn, seg.anchor.srcOut];
  return null;
}

function framingForSegments(segments, faces, { aspect = "9:16", mezz, zoomBase = 1 } = {}) {
  if (!Array.isArray(segments)) throw invalid("framingForSegments: segments array required");
  if (!mezz || !(mezz.w > 0) || !(mezz.h > 0)) throw invalid("framingForSegments: mezz {w,h} required");
  if (!ASPECT_RATIO[aspect]) throw invalid(`framingForSegments: unknown aspect '${aspect}'`);
  const zoom = clamp(Number(zoomBase) || 1, 1, 1.5);
  const assumed = isAssumed(faces);
  const keyframes = assumed ? [] : faces.keyframes
    .filter((k) => k && Number.isFinite(k.t) && Number.isFinite(k.cx) && Number.isFinite(k.cy) && Number.isFinite(k.h) && !inAbsent(faces, k.t))
    .slice().sort((a, b) => a.t - b.t);

  return segments.map((seg, idx) => {
    if (seg && seg.framing && seg.framing.locked) return JSON.parse(JSON.stringify(seg.framing));
    const span = spanOf(seg);
    if (!span || !(span[1] >= span[0])) throw invalid(`framingForSegments: segment ${idx} needs srcIn <= srcOut`);
    const [srcIn, srcOut] = span;
    const g = cropGeom(aspect, mezz, zoom);

    if (assumed) {
      const c = framingTarget(T.faceAt(null, srcIn), { aspect, mezz, zoom });
      return { mode: "static", zoomBase: zoom, keyframes: [{ src: r6(srcIn), cx: c.cx, cy: c.cy, zoom }], locked: false };
    }

    // Start on the face at the segment start (or the first visible keyframe inside it when absent there).
    let startFace = inAbsent(faces, srcIn) ? (keyframes.find((k) => k.t >= srcIn && k.t < srcOut) || null) : T.faceAt(faces, srcIn);
    if (!startFace) startFace = T.faceAt(null, srcIn);
    let cur = framingTarget(startFace, { aspect, mezz, zoom });
    const out = [{ src: r6(srcIn), cx: cur.cx, cy: cur.cy, zoom }];
    let busyUntil = srcIn;
    for (const kf of keyframes) {
      if (kf.t <= srcIn || kf.t >= srcOut || kf.t < busyUntil - 1e-9) continue;
      const tgt = framingTarget(kf, { aspect, mezz, zoom });
      const dx = (Math.abs(tgt.cx - cur.cx) * g.W) / g.w;
      const dy = (Math.abs(tgt.cy - cur.cy) * g.H) / g.h;
      if (dx <= DEAD_ZONE.x + 1e-9 && dy <= DEAD_ZONE.y + 1e-9) continue;
      const end = Math.min(kf.t + EASE_SEC, srcOut);
      if (end - kf.t < MIN_MOVE_SEC - 1e-9) continue;
      out.push({ src: r6(kf.t), cx: cur.cx, cy: cur.cy, zoom });
      out.push({ src: r6(end), cx: tgt.cx, cy: tgt.cy, zoom });
      cur = tgt;
      busyUntil = end;
      if (out.length >= 498) break;
    }
    return { mode: out.length > 1 ? "follow" : "static", zoomBase: zoom, keyframes: out, locked: false };
  });
}

module.exports = { framingForSegments, faceBoxAt, framingTarget, DEAD_ZONE, EASE_SEC, MIN_MOVE_SEC, HEADROOM };
