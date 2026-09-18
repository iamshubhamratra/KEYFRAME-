// VIDEO EDIT COMPOSITION BUILDER — resolved Edit Plan + materialized media -> Composition JSON (RENDER.md §2).
//
// WHY THIS EXISTS. The Edit Plan stores intent on the source timeline ("punch in on word 42", "B-roll #3 covers
// sentence s6", "logo top-right"). The renderer needs the opposite: integer output frames, crop rectangles in
// mezzanine pixels, overlay geometry in output pixels, ffmpeg-ready voice pieces. Deriving those in one PURE function
// gives three guarantees the product depends on: a preview and an export of the same revision are built from the
// same decisions (only sizes differ), every intermediate gets a key that changes only when its own inputs change (so
// replacing one B-roll never re-encodes the A-roll), and QA can re-derive what the render was supposed to contain.
// No I/O, no clock, no randomness: media facts (downloaded B-roll, the chosen music file, card renders, the logo)
// arrive in `media`, prepared by render/materialize.js.
//
// DECISIONS (each one is measured against RENDER.md §4 or a spike):
//   - A-roll pieces come from plan.timeline.pieces and are split further at effect / SPLIT-layout edges, so a
//     punch-in is a hard cut at a word start and no effect ever crosses a sub-piece.
//   - Framing priority per sub-piece: REFRAME effect > segment userCrop (framing.adjust) > jump-cut framing
//     (autoJumpCuts && punchInOnJumpCuts) > segment framing keyframes > smoothed face at the piece start. PUNCH_IN
//     multiplies the zoom; ZOOM_EMPHASIS animates it with `perspective` (S1). Zoom is capped so the export never
//     upscales the crop more than 2×.
//   - When even the unzoomed crop would upscale more than 2× at 1080p (a vertical source in a 16:9 output, or a
//     low-resolution source), or the plan asks for background 'blur', the whole frame is fitted over a blurred copy
//     instead of being cropped. The decision uses the 1080 reference so preview and export agree.
//   - Chunks group sub-pieces by an 8 s SOURCE grid (max 10 s): cut edits change only the chunks that contain them.
//   - Captions follow settings.captionLanguage: the translation track when one exists, else the spoken language.
//   - Items whose media is missing are dropped from the composition (never a black hole) and listed in `notes`.
//
// CONTRACT:
//   buildComposition(plan, ctx, profileName) -> Composition
//     plan: output of plan/resolve.resolvePlan (timeline.pieces, resolved spans, captions.cues placed).
//     ctx: { words, faces, scenes, mezz:{ w, h, sha }, voiceChain, media:{
//             broll:{ [itemId]: { path, type:'video'|'image', durationSec, w, h, sha? } },
//             music:{ path, durationSec, title?, sha? } | null,
//             sfx:{ [sfxId]: { path } },
//             logo:{ path, w, h, sha? } | null,
//             cards:{ [graphicId]: { status:'ok', path, w, h, cardHash } | { status:'fallback', fallback, cardHash } } } }
//     Composition = { version, compositionHash, profile:{ name, W, H, fps, inter, final }, durationFrames, fit,
//       base:{ pieces:[SubPiece], chunks:[{ key, pieceIds, srcStartF, srcEndF, frames }], key },
//       overlays:[Overlay], captions:{ ass, fonts, assHash, lang, cueCount } | null, cardAss:[{ id, text, hash }],
//       audio:{ voice:{ pieces, chain }, music, sfx }, layout:{ output, durationFrames, elements, crops }, credits, notes }
//   planHashOf(plan) -> sha256 of the plan revision's canonical JSON minus derived caches
//   SubPiece = { id, pieceId, kind:'play'|'hold'|'speed', srcInF, srcOutF, outInF, outOutF, rate, holdF,
//                framing:{ mode:'static'|'pan'|'zoomAnim'|'fit', crop?, keyframes?, z0?, z1?, frames?, anchor? },
//                layout:'FACE'|'SPLIT', split?:{ itemId, side, source:{ path, type, trimInSec, durationSec, focus }, box, offsetF,
//                                                frames, faceCrop } }
//   Overlay = { id, kind:'broll'|'pip'|'card'|'dip'|'logo', outInF, outOutF, geom:{ x, y, w, h }, z, fadeInF, fadeOutF,
//               source?:{ path, type, trimInSec, durationSec, focus }, card?:{ path }, dip?:{ kind, jointF, halfFrames },
//               logo?:{ path, opacity, show } }

const crypto = require("node:crypto");
const fsx = require("../fsx");
const T = require("../plan/timeline");
const P = require("./profiles");
const { resolveStyle } = require("../captions/styles");
const { buildAss } = require("../captions/ass");
const { cueBox } = require("../captions/place");
const { REGION_BOXES } = require("../plan/resolve");
const { envelopeFor } = require("../audio/music");
const cards = require("../cards/render");
const TR = require("./transitions");
const { lookFilter, LOOKS } = require("./looks");
const { EditError } = require("../errors");

const VERSION = 1;
const FPS = 30;
const CHUNK_GRID_F = 8 * FPS;
const CHUNK_MAX_F = 10 * FPS;
const MIN_SUB_F = 4;
const UPSCALE_CAP = P.UPSCALE_CAP;
const BROLL_FADE_F = 4;
const REFERENCE_PROFILE = "export1080";

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const toF = (t) => Math.round(Number(t) * FPS);
// "pending" items (a user-picked candidate not downloaded yet) render once materialize found their media.
const live = (b) => b && b.status !== "removed" && b.status !== "missing";
const shown = (el) => el && el.resolved && !el.resolved.collapsed && el.resolved.outOut > el.resolved.outIn;
const sha1 = (v) => crypto.createHash("sha1").update(typeof v === "string" ? v : fsx.canonicalJson(v)).digest("hex");

function invalid(detail) { return new EditError("COMPOSE_INVALID", { status: 500, errorClass: "bug", detail }); }

// The plan revision minus the caches resolvePlan derives: two renders of one revision share a planHash.
function planHashOf(plan) {
  const { timeline, ...rest } = plan || {};
  void timeline;
  return fsx.sha256Json(rest);
}

// ---------------------------------------------------------------- geometry
function geomFor(mezz, out) {
  const W = mezz.w, H = mezz.h, A = out.w / out.h;
  const bw = Math.min(W, H * A);
  return { W, H, bw, bh: bw / A, A };
}

// Would the unzoomed crop upscale more than the cap at the 1080 reference? (one definition: render/profiles)
const needsFit = P.needsFit;

function zoomCap(mezz, aspect) {
  const ref = P.outputFor(REFERENCE_PROFILE, aspect);
  const g = geomFor(mezz, ref);
  return Math.max(1, (UPSCALE_CAP * g.bh) / ref.h);
}

// Crop for a framing point (the mezzanine point placed at x .5 / y faceYTarget) — the geometry of plan/timeline.cropFor,
// so the renderer frames exactly what the ops engine warned about.
function cropAt(g, z, point, yTarget, offsetX = 0, offsetY = 0) {
  const c = T.cropFor(g, z, { cx: point.cx, cy: point.cy, h: Number.isFinite(point.h) ? point.h : 0 }, offsetX, yTarget, offsetY);
  const w = even(Math.min(c.w, g.W - (g.W % 2)));
  const h = even(Math.min(c.h, g.H - (g.H % 2)));
  return { x: clamp(Math.round(c.x / 2) * 2, 0, g.W - w), y: clamp(Math.round(c.y / 2) * 2, 0, g.H - h), w, h };
}

// ---------------------------------------------------------------- A-roll
function segmentForSpan(plan, words, srcT) {
  const segs = (plan.aRoll && plan.aRoll.segments) || [];
  for (const s of segs) {
    const span = T.anchorToSrc(s.anchor, words);
    if (span && srcT >= span[0] - 0.05 && srcT < span[1] + 0.05) return s;
  }
  return null;
}

function keyframeAt(framing, srcT) {
  const K = framing && Array.isArray(framing.keyframes) ? framing.keyframes.filter((k) => k && Number.isFinite(k.src)) : [];
  if (!K.length) return null;
  let cur = K[0];
  for (const k of K) if (k.src <= srcT + 1e-6) cur = k;
  return cur;
}

function effectSpans(plan) {
  const fxOn = plan.settings.effectsEnabled !== false;
  const out = [];
  for (const e of plan.effects || []) {
    if (!fxOn || !e || e.enabled !== true || !shown(e)) continue;
    if (!["PUNCH_IN", "ZOOM_EMPHASIS", "REFRAME"].includes(e.kind)) continue;
    out.push({ id: e.id, kind: e.kind, inF: toF(e.resolved.outIn), outF: toF(e.resolved.outOut), e });
  }
  return out;
}

function splitSpans(plan, media, aspect) {
  if (aspect === "1:1") return [];   // no split form in 1:1: buildOverlays renders these FULL
  const out = [];
  for (const b of plan.broll || []) {
    if (b.layout !== "SPLIT" || !live(b) || !shown(b)) continue;
    const m = media.broll && media.broll[b.id];
    if (!m) continue;
    out.push({ id: b.id, inF: toF(b.resolved.outIn), outF: toF(b.resolved.outOut), b, m });
  }
  return out;
}

function subdivide(piece, spans) {
  const inF = toF(piece.outIn), outF = toF(piece.outOut);
  if (piece.kind !== "play") return [[inF, outF]];
  const pts = new Set([inF, outF]);
  for (const s of spans) {
    for (const f of [s.inF, s.outF]) if (f > inF + MIN_SUB_F && f < outF - MIN_SUB_F) pts.add(f);
  }
  const sorted = [...pts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < sorted.length; i++) if (sorted[i + 1] > sorted[i]) out.push([sorted[i], sorted[i + 1]]);
  return out;
}

function buildBase(plan, ctx, out, fit, notes) {
  const { words = [], faces = null, scenes = [], mezz, media = {} } = ctx;
  const aspect = plan.output.aspect;
  const g = geomFor(mezz, out);
  const yTarget = T.FACE_Y_TARGET[aspect] != null ? T.FACE_Y_TARGET[aspect] : 0.4;
  const zMax = zoomCap(mezz, aspect);
  const pieces = (plan.timeline && plan.timeline.pieces) || [];
  if (!pieces.length) throw invalid("plan has no timeline pieces");
  const settings = plan.settings;
  const jump = settings.autoJumpCuts && settings.punchInOnJumpCuts && !fit
    ? T.jumpCutFraming(pieces, faces, { effects: settings.effects, aspect, mezz, output: out, scenes, cuts: plan.cuts })
    : null;
  const jumpById = new Map((jump || []).map((j) => [j.pieceId, j]));
  const fx = effectSpans(plan);
  const splits = splitSpans(plan, media, aspect);

  const subs = [];
  for (const p of pieces) {
    const pOutInF = toF(p.outIn);
    const pSrcInF = toF(p.srcIn);
    const ranges = subdivide(p, fit ? [] : [...fx, ...splits]);
    for (const [aF, bF] of ranges) {
      const srcInF = p.kind === "play" ? pSrcInF + (aF - pOutInF) : pSrcInF;
      const srcOutF = p.kind === "play" ? srcInF + (bF - aF) : toF(p.srcOut);
      const srcT = srcInF / FPS;
      const sub = {
        id: `sp_${p.kind[0]}${srcInF}_${aF - pOutInF}`, pieceId: p.id, kind: p.kind, srcInF, srcOutF, outInF: aF, outOutF: bF,
        rate: p.kind === "speed" ? p.rate : 1, holdF: p.kind === "hold" ? bF - aF : 0, layout: "FACE", framing: null,
      };
      const mid = Math.floor((aF + bF) / 2);
      const split = splits.find((s) => mid >= s.inF && mid < s.outF);
      if (fit) {
        sub.framing = { mode: "fit" };
      } else {
        const seg = segmentForSpan(plan, words, srcT);
        const face = T.faceAt(faces, srcT);
        const refx = fx.filter((s) => s.kind === "REFRAME" && mid >= s.inF && mid < s.outF).pop();
        const punch = fx.filter((s) => s.kind === "PUNCH_IN" && mid >= s.inF && mid < s.outF).pop();
        const zem = fx.filter((s) => s.kind === "ZOOM_EMPHASIS" && mid >= s.inF && mid < s.outF).pop();
        let point = { cx: face.cx, cy: face.cy, h: face.h };
        let z = 1, offX = 0, offY = 0, moves = [];
        const jf = jumpById.get(p.id);
        const fr = seg && seg.framing;
        if (refx) {
          point = { cx: refx.e.cx, cy: refx.e.cy, h: 0 };
          z = refx.e.zoom || 1;
        } else if (fr && fr.userCrop) {
          point = { cx: fr.userCrop.cx, cy: fr.userCrop.cy, h: 0 };
          z = fr.userCrop.zoom || 1;
        } else if (jf) {
          z = jf.z; offX = jf.offsetX; offY = jf.offsetY;
          point = { cx: jf.cx, cy: jf.cy, h: face.h };
          moves = p.kind === "play" ? (jf.moves || []).filter((m) => m.src > srcT && m.src < srcOutF / FPS) : [];
        } else if (fr && Array.isArray(fr.keyframes) && fr.keyframes.length) {
          const k = keyframeAt(fr, srcT);
          point = { cx: k.cx, cy: k.cy, h: 0 };
          z = Math.max(1, (fr.zoomBase || 1) * (k.zoom || 1));
          if (fr.mode === "follow" && p.kind === "play") {
            moves = fr.keyframes.filter((m) => m.src > srcT + 1e-6 && m.src < srcOutF / FPS - 1e-6).map((m) => ({ src: m.src, cx: m.cx, cy: m.cy, h: 0, zoom: m.zoom }));
          }
        }
        if (punch) {
          z *= punch.e.zoom || 1.1;
          if (punch.e.center && typeof punch.e.center === "object") point = { cx: punch.e.center.cx, cy: punch.e.center.cy, h: 0 };
          else point = { cx: face.cx, cy: face.cy, h: face.h };
          moves = [];
        }
        z = clamp(z, 1, zMax);
        if (split) {
          const halfOut = aspect === "9:16" ? { w: out.w, h: out.h / 2 } : { w: out.w / 2, h: out.h };
          const hg = geomFor(mezz, halfOut);
          const faceCrop = cropAt(hg, 1, { cx: face.cx, cy: face.cy, h: face.h }, 0.45);
          const side = split.b.layoutParams && split.b.layoutParams.splitSide
            ? split.b.layoutParams.splitSide : (aspect === "9:16" ? "top" : "left");
          const trimIn = Number(split.b.chosen && split.b.chosen.trimInSec) || 0;
          sub.layout = "SPLIT";
          // The B-roll half is conformed ONCE for the whole SPLIT span (half-frame box, 30 fps, exact frames); every
          // sub-piece inside the span reads it from its own frame offset.
          sub.split = {
            itemId: split.b.id, side: aspect === "9:16" ? (side === "bottom" ? "bottom" : "top") : (side === "right" ? "right" : "left"),
            source: { path: split.m.path, type: split.m.type, sha: split.m.sha || null, trimInSec: split.m.type === "video" ? trimIn : 0,
              durationSec: r6((split.outF - split.inF) / FPS), focus: (split.b.chosen && split.b.chosen.focus) || { fx: 0.5, fy: 0.5 } },
            box: { w: even(halfOut.w), h: even(halfOut.h) }, offsetF: aF - split.inF, frames: bF - aF, faceCrop,
          };
          sub.framing = { mode: "static", crop: faceCrop };
        } else if (zem && p.kind === "play") {
          // One continuous move across the whole effect span, even when another effect's edge splits it into several
          // sub-pieces: every sub-piece shares the effect's framing point and animates only its own slice of the curve.
          const e = zem.e;
          const span = T.anchorToSrc(e.anchor, words);
          const fz = span ? T.faceAt(faces, span[0]) : face;
          const zPoint = refx || (fr && fr.userCrop) ? point : { cx: fz.cx, cy: fz.cy, h: fz.h };
          const crop = cropAt(g, z, zPoint, yTarget, offX, offY);
          const zs = clamp(e.fromZoom || 1, 1, 2), ze = clamp(Math.min(e.toZoom || 1.1, zMax / z), 1, 2);
          const N = Math.max(1, zem.outF - zem.inF);
          const ease = (x) => (e.ease === "linear" ? x : x * x * (3 - 2 * x));
          const zAt = (f) => zs + (ze - zs) * ease(clamp((f - zem.inF) / N, 0, 1));
          const z0 = zAt(aF), z1 = zAt(bF);
          const anchor = { fx: clamp((fz.cx * g.W - crop.x) / crop.w, 0.1, 0.9), fy: clamp((fz.cy * g.H - crop.y) / crop.h, 0.1, 0.9) };
          const whole = aF === zem.inF && bF === zem.outF;
          sub.framing = bF - aF >= 2 && z1 > z0 + 1e-3
            ? { mode: "zoomAnim", crop, z0: r6(z0), z1: r6(z1), frames: bF - aF, ease: whole && e.ease !== "linear" ? "smoothstep" : "linear", anchor: { fx: r6(anchor.fx), fy: r6(anchor.fy) } }
            : { mode: "static", crop };
        } else if (moves.length) {
          const crop = cropAt(g, z, point, yTarget, offX, offY);
          const kfs = [{ src: srcT, x: crop.x, y: crop.y }];
          let last = crop;
          for (const m of moves) {
            const c = cropAt(g, z, { cx: m.cx, cy: m.cy, h: Number.isFinite(m.h) ? m.h : face.h }, yTarget, offX, offY);
            if (c.x === last.x && c.y === last.y) continue;
            const t0 = Math.max(srcT, m.src);
            const t1 = Math.min(srcOutF / FPS, t0 + (m.easeSec || 0.5));
            if (t1 - t0 < 0.1) continue;
            kfs.push({ src: r6(t0), x: last.x, y: last.y }, { src: r6(t1), x: c.x, y: c.y });
            last = c;
          }
          sub.framing = kfs.length > 1 ? { mode: "pan", crop: { w: crop.w, h: crop.h }, keyframes: kfs } : { mode: "static", crop };
        } else {
          sub.framing = { mode: "static", crop: cropAt(g, z, point, yTarget, offX, offY) };
        }
      }
      subs.push(sub);
    }
  }

  // Chunks: an 8 s source grid (so chunk membership is local to an edit), never longer than 10 s of output.
  const chunks = [];
  let cur = null;
  for (const s of subs) {
    const bucket = Math.floor(s.srcInF / CHUNK_GRID_F);
    const len = s.outOutF - s.outInF;
    if (!cur || cur.bucket !== bucket || cur.frames + len > CHUNK_MAX_F) {
      cur = { bucket, subs: [], frames: 0 };
      chunks.push(cur);
    }
    cur.subs.push(s);
    cur.frames += len;
  }
  const profileKey = { W: out.w, H: out.h };
  const outChunks = chunks.map((c) => {
    const spec = c.subs.map((s) => ({
      kind: s.kind, srcInF: s.srcInF, srcOutF: s.srcOutF, rate: s.rate, holdF: s.holdF, framing: s.framing, layout: s.layout,
      split: s.split ? { src: { ...s.split.source, path: s.split.source.sha || s.split.source.path }, box: s.split.box, offsetF: s.split.offsetF, frames: s.split.frames, side: s.split.side, faceCrop: s.split.faceCrop } : null,
    }));
    return {
      key: sha1({ v: VERSION, mezz: mezz.sha || null, profile: profileKey, spec }),
      pieceIds: c.subs.map((s) => s.id),
      srcStartF: Math.min(...c.subs.map((s) => s.srcInF)),
      srcEndF: Math.max(...c.subs.map((s) => Math.max(s.srcOutF, s.srcInF + 1))),
      frames: c.frames,
    };
  });
  const durationFrames = subs.length ? subs[subs.length - 1].outOutF : 0;
  if (durationFrames <= 0) throw invalid("composition has no frames");
  void notes;
  return { pieces: subs, chunks: outChunks, key: sha1(outChunks.map((c) => c.key)), durationFrames, zMax };
}

// ---------------------------------------------------------------- overlays
function pipBoxPx(b, out) {
  const s = clamp(b.layoutParams && b.layoutParams.scale ? b.layoutParams.scale : 0.4, 0.3, 0.55);
  // Box aspect follows the output aspect so one of the shipped rounded-corner masks fits exactly.
  const w = even(out.w * s);
  const h = even((w * out.h) / out.w);
  const m = Math.round(Math.min(out.w, out.h) * 0.04);
  const corner = (b.layoutParams && b.layoutParams.corner) || "tr";
  const x = corner.endsWith("l") ? m : out.w - m - w;
  const y = corner.startsWith("t") ? Math.round(out.h * 0.06) : out.h - Math.round(out.h * 0.24) - h;
  return { x: Math.round(x / 2) * 2, y: Math.round(y / 2) * 2, w, h };
}

// ---------------------------------------------------------------- the speaker's face on the OUTPUT frame
// Face box in output pixels at output frame f, from the face track and the framing the base renderer applies to
// that sub-piece (static / pan / zoom / fit). null when there is no tracked face, it is absent, the frame is under
// full-screen B-roll, or the sub-piece is a SPLIT layout (the face half is drawn by the split renderer).
function faceOutAt(subs, faces, mezz, out, f, hiddenF = []) {
  if (!faces || !Array.isArray(subs) || !subs.length) return null;
  if (hiddenF.some(([a, b]) => f >= a && f < b)) return null;
  const s = subs.find((x) => f >= x.outInF && f < x.outOutF) || null;
  if (!s || s.layout === "SPLIT" || !s.framing) return null;
  const srcT = s.kind === "play" ? (s.srcInF + (f - s.outInF)) / FPS : s.srcInF / FPS;
  if ((faces.absent || []).some((r) => srcT >= r.start && srcT < r.end)) return null;
  const face = T.faceAt(faces, srcT);
  if (!face || !Number.isFinite(face.cx) || !Number.isFinite(face.cy) || !(face.h > 0)) return null;
  const fh = face.h * mezz.h, fw = fh * 0.8, cx = face.cx * mezz.w, cy = face.cy * mezz.h;
  const fr = s.framing;
  let crop;
  if (fr.mode === "fit") {
    const fp = P.fitPlacement(mezz, out);
    return { x: fp.x + (cx - fw / 2) * fp.s, y: fp.y + (cy - fh / 2) * fp.s, w: fw * fp.s, h: fh * fp.s };
  } else if (fr.mode === "pan" && Array.isArray(fr.keyframes) && fr.keyframes.length) {
    const K = fr.keyframes;
    let x = K[0].x, y = K[0].y;
    for (let i = 0; i < K.length; i++) {
      if (K[i].src <= srcT) { x = K[i].x; y = K[i].y; }
      if (i + 1 < K.length && K[i].src <= srcT && K[i + 1].src > srcT) {
        const u = (srcT - K[i].src) / Math.max(1e-6, K[i + 1].src - K[i].src);
        x = K[i].x + (K[i + 1].x - K[i].x) * u; y = K[i].y + (K[i + 1].y - K[i].y) * u;
        break;
      }
    }
    crop = { x, y, w: fr.crop.w, h: fr.crop.h };
  } else if (fr.crop && Number.isFinite(fr.crop.x)) {
    crop = fr.crop;
    if (fr.mode === "zoomAnim" && fr.frames > 0) {
      const z = fr.z0 + (fr.z1 - fr.z0) * clamp((f - s.outInF) / fr.frames, 0, 1);
      const w = crop.w / z, h = crop.h / z;
      const an = fr.anchor || { fx: 0.5, fy: 0.5 };
      crop = { x: crop.x + (crop.w - w) * an.fx, y: crop.y + (crop.h - h) * an.fy, w, h };
    }
  } else return null;
  const sx = out.w / crop.w, sy = out.h / crop.h;
  return { x: (cx - fw / 2 - crop.x) * sx, y: (cy - fh / 2 - crop.y) * sy, w: fw * sx, h: fh * sy };
}

// Output-frame spans covered by full-screen B-roll (the speaker is not on screen there).
function fullBrollSpans(plan, media, aspect) {
  const out = [];
  for (const b of plan.broll || []) {
    if (!live(b) || !shown(b)) continue;
    const full = b.layout === "FULL" || (b.layout === "SPLIT" && aspect === "1:1") || !b.layout;
    if (!full || !(media.broll && media.broll[b.id])) continue;
    out.push([toF(b.resolved.outIn), toF(b.resolved.outOut)]);
  }
  return out;
}

const interArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// Where a card's LETTERS sit inside its box (output px, relative to the box). A card box is mostly transparent
// padding; placement and QA must reason about the ink, not the box.
function cardInk(c, geom) {
  if (c && c.status === "ok" && c.ink && c.w > 0 && c.h > 0) {
    const sx = geom.w / c.w, sy = geom.h / c.h;
    return { x: c.ink.x * sx, y: c.ink.y * sy, w: c.ink.w * sx, h: c.ink.h * sy };
  }
  const fb = c && c.fallback;
  if (fb && Array.isArray(fb.assEvents) && fb.assEvents.length && fb.region && fb.region.w > 0) {
    // the same mapping buildOverlays hands fallbackAssText: region px × scale, from the box's top-left corner
    const scale = Math.min(geom.w / fb.region.w, geom.h / fb.region.h);
    const offX = 0, offY = 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of fb.assEvents) {
      const lines = Array.isArray(e.lines) && e.lines.length ? e.lines : [String(e.text || "")];
      const size = Number(e.sizePx) || 40;
      const h = lines.length * size * 1.18;
      const chars = Math.max(...lines.map((l) => [...String(l)].length), 1);
      const w = Math.min(fb.region.w * 0.92, chars * size * 0.62);
      x0 = Math.min(x0, e.x - w / 2); x1 = Math.max(x1, e.x + w / 2);
      y0 = Math.min(y0, e.y - h / 2); y1 = Math.max(y1, e.y + h / 2);
    }
    if (Number.isFinite(x0)) return { x: offX + x0 * scale, y: offY + y0 * scale, w: (x1 - x0) * scale, h: (y1 - y0) * scale };
  }
  // unknown: the middle half of the box
  return { x: geom.w * 0.08, y: geom.h * 0.25, w: geom.w * 0.84, h: geom.h * 0.5 };
}

// Face-aware card placement. The card keeps its size (a HyperFrames card was rendered at exactly that size) and
// moves only vertically: to the position whose ink is clear of the speaker's face (over every frame the card is up)
// and of the captions showing at the same time, inside the platform safe area, as close as possible to its region.
// A card whose natural spot is already clear does not move.
function placeCard(geom, ink, { faceBoxes, captionBoxes, out, aspect }) {
  if (!faceBoxes.length) return { ...geom, overFace: 0 };
  const safe = P.SAFE_AREAS[aspect] || P.SAFE_AREAS["9:16"];
  const top = safe.top * out.h, bottom = (1 - safe.bottom) * out.h;
  const gap = out.h * 0.015;
  const faces = faceBoxes.map((b) => ({ x: b.x - gap, y: b.y - gap, w: b.w + 2 * gap, h: b.h + 2 * gap }));
  const inkArea = Math.max(1, ink.w * ink.h);
  const cost = (y) => {
    const r = { x: geom.x + ink.x, y: y + ink.y, w: ink.w, h: ink.h };
    let face = 0, cap = 0;
    for (const f of faces) face = Math.max(face, interArea(r, f));
    for (const c of captionBoxes) cap = Math.max(cap, interArea(r, c));
    const outside = Math.max(0, top - r.y) + Math.max(0, r.y + r.h - bottom);
    return { total: (1000 * face + 400 * cap) / inkArea + 20 * (outside / out.h) + Math.abs(y - geom.y) / out.h, face: face / inkArea };
  };
  const here = cost(geom.y);
  if (here.face === 0 && here.total < 1) return { ...geom, overFace: 0 };
  let best = { y: geom.y, ...here };
  const step = Math.max(2, Math.round(out.h * 0.005));
  for (let inkTop = Math.ceil(top); inkTop + ink.h <= bottom; inkTop += step) {
    const y = Math.round(inkTop - ink.y);
    const c = cost(y);
    if (c.total < best.total - 1e-9) best = { y, ...c };
  }
  return { ...geom, y: best.y, overFace: Math.round(best.face * 1000) / 1000 };
}

// The plan's own (non-CUT, enabled) transitions with their joint on the output timeline, in output frames.
function explicitTransitions(plan) {
  const out = [];
  for (const t of plan.transitions || []) {
    if (!t || t.enabled === false || t.kind === "CUT") continue;
    let jointS = null;
    if (t.at && Number.isFinite(t.at.outAt)) jointS = t.at.outAt;
    else if (t.at && t.at.elementId) {
      const seg = ((plan.aRoll && plan.aRoll.segments) || []).find((s) => s.id === t.at.elementId);
      if (seg && shown(seg)) jointS = seg.resolved.outOut;
    }
    if (jointS == null) continue;
    out.push({ id: t.id, kind: t.kind, jointF: toF(jointS), durationSec: t.durationSec });
  }
  return out;
}

// Card box: the template's region size scaled to the profile, shrunk to fit inside the platform safe area, centred
// horizontally and placed in its region band — never in the top/bottom UI zones (qa/checks flags those).
function cardGeom(g, out, profileName, aspect) {
  const tpl = cards.getTemplate(g.templateId || cards.KIND_TO_TEMPLATE[g.kind]);
  const ref = tpl && typeof tpl.defaultDims === "function" ? tpl.defaultDims(aspect) : { w: 1080, h: 560 };
  const safe = P.SAFE_AREAS[aspect] || P.SAFE_AREAS["9:16"];
  const s = P.scaleFor(profileName);
  const top = Math.ceil(safe.top * out.h), bottom = Math.floor((1 - safe.bottom) * out.h);
  const maxW = out.w * (1 - 2 * safe.side), maxH = bottom - top;
  const fit = Math.min(1, maxW / (ref.w * s), maxH / (ref.h * s));
  const w = even(Math.floor(ref.w * s * fit)), h = even(Math.floor(ref.h * s * fit));
  const box = REGION_BOXES[g.region] || REGION_BOXES.top;
  const x = Math.round((out.w - w) / 2);
  const want = g.region === "center" ? (out.h - h) / 2 : box.y * out.h + (box.h * out.h - h) / 2;
  const y = Math.round(clamp(want, top, bottom - h));
  return { x, y, w, h };
}

function buildOverlays(plan, ctx, out, profileName, durationFrames, notes, place = null) {
  const media = ctx.media || {};
  const aspect = plan.output.aspect;
  const overlays = [];
  const credits = [];

  for (const b of plan.broll || []) {
    if (!live(b) || !shown(b) || (b.layout === "SPLIT" && aspect !== "1:1")) continue;
    if (b.layout === "SPLIT") notes.push({ code: "SPLIT_AS_FULL", elementId: b.id });
    const m = media.broll && media.broll[b.id];
    // No chosen asset yet (retrieval pending) is not a broken asset; a chosen one without media is.
    if (!m) { notes.push({ code: b.chosen ? "BROLL_MEDIA_MISSING" : "BROLL_NOT_CHOSEN", elementId: b.id }); continue; }
    const inF = toF(b.resolved.outIn), outF = Math.min(durationFrames, toF(b.resolved.outOut));
    if (outF - inF < 6) continue;
    const pip = b.layout === "PIP";
    // A PIP never shares a corner with the logo: it flips to the other side of the frame.
    const logo = plan.branding && plan.branding.logo && plan.branding.logo.show !== "none" && media.logo ? plan.branding.logo : null;
    let pipItem = b;
    if (pip && logo) {
      const corner = (b.layoutParams && b.layoutParams.corner) || "tr";
      const lc = logo.placement || "tr";
      if (corner === lc) pipItem = { ...b, layoutParams: { ...(b.layoutParams || {}), corner: `${corner[0]}${corner[1] === "r" ? "l" : "r"}` } };
    }
    const geom = pip ? pipBoxPx(pipItem, out) : { x: 0, y: 0, w: out.w, h: out.h };
    const trimInSec = Number(b.chosen && b.chosen.trimInSec) || 0;
    overlays.push({
      id: b.id, kind: pip ? "pip" : "broll", outInF: inF, outOutF: outF, geom, z: pip ? 20 : 10,
      fadeInF: BROLL_FADE_F, fadeOutF: BROLL_FADE_F,
      source: { path: m.path, type: m.type, sha: m.sha || null, trimInSec: m.type === "video" ? trimInSec : 0, durationSec: r6((outF - inF) / FPS),
        focus: b.chosen && b.chosen.focus ? b.chosen.focus : { fx: 0.5, fy: 0.5 } },
    });
    if (b.chosen) credits.push({ assetId: b.chosen.assetId, provider: b.chosen.provider, license: b.chosen.license || null, attribution: b.chosen.attribution || null, sourceUrl: b.chosen.sourceUrl || null, kind: "broll" });
  }

  // Dip transitions (dip to black / white, flash): a colour overlay across the joint. Every other kind is a real
  // picture transition drawn on the base by the composite (render/transitions.js).
  for (const t of explicitTransitions(plan)) {
    if (!TR.DIP_KINDS.includes(t.kind)) continue;
    const half = Math.max(2, Math.round(((t.durationSec || 0.2) * FPS) / 2));
    if (t.jointF - half < 0 || t.jointF + half > durationFrames) continue;
    overlays.push({ id: t.id, kind: "dip", outInF: t.jointF - half, outOutF: t.jointF + half, geom: { x: 0, y: 0, w: out.w, h: out.h }, z: 30, fadeInF: 0, fadeOutF: 0, dip: { kind: t.kind, jointF: t.jointF, halfFrames: half } });
  }

  const cardAss = [];
  for (const g of plan.graphics || []) {
    if (!g || g.enabled !== true || !shown(g)) continue;
    const c = media.cards && media.cards[g.id];
    const inF = toF(g.resolved.outIn), outF = Math.min(durationFrames, toF(g.resolved.outOut));
    if (outF - inF < 6) continue;
    const geom0 = cardGeom(g, out, profileName, aspect);
    const inkRel = cardInk(c, geom0);
    let geom = geom0;
    if (place) {
      const faceBoxes = [];
      for (let f = inF; f < outF; f += 5) {
        const b = faceOutAt(place.subs, place.faces, place.mezz, out, f, place.hiddenF);
        if (b) faceBoxes.push(b);
      }
      const p = placeCard(geom0, inkRel, { faceBoxes, captionBoxes: place.captionBoxes(inF, outF), out, aspect });
      geom = { x: p.x, y: p.y, w: p.w, h: p.h };
      if (p.y !== geom0.y) notes.push({ code: "CARD_MOVED_OFF_FACE", elementId: g.id, dy: p.y - geom0.y });
      if (p.overFace > 0.15) notes.push({ code: "CARD_OVER_FACE", elementId: g.id, frac: p.overFace });
    }
    const ink = { x: Math.round(geom.x + inkRel.x), y: Math.round(geom.y + inkRel.y), w: Math.round(inkRel.w), h: Math.round(inkRel.h) };
    if (c && c.status === "ok" && c.path) {
      overlays.push({ id: g.id, kind: "card", outInF: inF, outOutF: Math.min(outF, inF + Math.round((c.durSec || (outF - inF) / FPS) * FPS)), geom: { ...geom, w: c.w || geom.w, h: c.h || geom.h }, ink, z: 40, fadeInF: 0, fadeOutF: 0, card: { path: c.path, cardHash: c.cardHash } });
    } else if (c && c.status === "fallback" && c.fallback) {
      const region = c.fallback.region || { w: geom.w, h: geom.h };
      const scale = Math.min(geom.w / region.w, geom.h / region.h);
      const text = cards.fallbackAssText(c.fallback, { output: { w: out.w, h: out.h }, outInSec: inF / FPS, offsetX: geom.x, offsetY: geom.y, scale });
      cardAss.push({ id: g.id, text, hash: sha1(text), fonts: c.fallback.fonts || [] });
      overlays.push({ id: g.id, kind: "card", outInF: inF, outOutF: outF, geom, ink, z: 40, fadeInF: 0, fadeOutF: 0, card: { path: null, fallback: true, cardHash: c.cardHash || null } });
    } else notes.push({ code: "CARD_MISSING", elementId: g.id });
  }

  const logo = plan.branding && plan.branding.logo;
  if (logo && logo.show !== "none" && media.logo && media.logo.path) {
    const w = even(out.w * clamp(logo.scale || 0.12, 0.08, 0.2));
    const h = even((w * (media.logo.h || w)) / (media.logo.w || w));
    const m = Math.round(Math.min(out.w, out.h) * clamp(logo.marginPct || 0.04, 0.03, 0.08));
    const pl = logo.placement || "tr";
    // Portrait: keep clear of the platform UI band at the top (status bar / account row).
    const topM = aspect === "9:16" ? Math.max(m, Math.round(out.h * 0.06)) : m;
    const x = pl.endsWith("l") ? m : out.w - m - w;
    const y = pl.startsWith("t") ? topM : out.h - m - h - (aspect === "9:16" ? Math.round(out.h * 0.12) : 0);
    overlays.push({ id: "logo", kind: "logo", outInF: 0, outOutF: durationFrames, geom: { x: Math.round(x / 2) * 2, y: Math.round(y / 2) * 2, w, h }, z: 60, fadeInF: 0, fadeOutF: 0,
      logo: { path: media.logo.path, sha: media.logo.sha || null, opacity: clamp(logo.opacity == null ? 1 : logo.opacity, 0.6, 1), show: logo.show === "intro_outro" ? "intro_outro" : "always" } });
  }
  overlays.sort((a, b) => a.z - b.z || a.outInF - b.outInF || (a.id < b.id ? -1 : 1));
  return { overlays, cardAss, credits };
}

// ---------------------------------------------------------------- captions
function captionTrack(plan, out, notes) {
  const cap = plan.captions;
  if (!cap || cap.enabled === false || plan.settings.captionsEnabled === false) return null;
  const srcLang = cap.sourceLanguage || plan.source.language || "en";
  const want = plan.settings.captionLanguage && plan.settings.captionLanguage !== "auto" ? plan.settings.captionLanguage : srcLang;
  let lang = srcLang, cues = cap.cues || [];
  if (want !== srcLang) {
    const tr = cap.translations && cap.translations[want];
    if (tr && Array.isArray(tr.cues) && tr.cues.length) { lang = want; cues = tr.cues; } else notes.push({ code: "TRANSLATION_PENDING", lang: want });
  }
  const visible = cues.filter((c) => c && !c.hidden && c.resolved && !c.resolved.collapsed);
  if (!visible.length) return null;
  const style = resolveStyle(cap.styleId, { brand: plan.branding && plan.branding.palette, brandColors: plan.settings.brandColors, lang, aspect: plan.output.aspect, output: { width: out.w, height: out.h } });
  const built = buildAss({ cues: visible, style, output: { w: out.w, h: out.h }, lang, highlight: cap.highlight });
  if (built.missingGlyphs && built.missingGlyphs.length) notes.push({ code: "CAPTION_MISSING_GLYPHS", count: built.missingGlyphs.length });
  return { ass: built.text, fonts: built.fonts, families: built.families, assHash: built.assHash, lang, cueCount: built.cueCount, style, cues: visible };
}

// ---------------------------------------------------------------- audio
function buildAudio(plan, ctx, durationFrames, notes, transitions = []) {
  const media = ctx.media || {};
  const pieces = plan.timeline.pieces.map((p) => {
    if (p.kind === "hold") return { srcInS: p.srcIn, srcOutS: p.srcIn, padS: r6(p.outOut - p.outIn), rate: 1 };
    return { srcInS: p.srcIn, srcOutS: p.srcOut, rate: p.kind === "speed" ? p.rate : 1, padS: 0 };
  });
  const chain = ctx.voiceChain && typeof ctx.voiceChain === "object" ? ctx.voiceChain : { highpassHz: 80, notchesHz: [], afftdn: null, dynaudnorm: false, deesser: false };
  let music = null;
  const m = plan.music;
  const credits = [];
  if (m && m.enabled && plan.settings.musicEnabled !== false) {
    if (media.music && media.music.path) {
      const map = T.buildTimeMap(plan.timeline.pieces);
      const envelope = envelopeFor(m, { resolveAnchor: (a) => map.resolveAnchor(a, ctx.words || [], { minDur: 2 / FPS }), durationSec: durationFrames / FPS });
      music = { path: media.music.path, sha: media.music.sha || null, volume: m.volume, envelope, startOffsetSec: m.startOffsetSec || 0,
        duck: m.duck || { enabled: true, depthDb: -9 }, fadeInSec: m.fadeInSec, fadeOutSec: m.fadeOutSec };
      const tr = m.track || {};
      const source = { pixabay_bridge: "Pixabay", synth: "generated by KEYFRAME", user: "your upload" }[tr.provider] || null;
      const attribution = tr.title ? `“${tr.title}”${source ? ` — ${source}` : ""}` : (source ? `Music: ${source}` : null);
      credits.push({ assetId: tr.assetId || null, provider: source, license: tr.license || null, attribution, sourceUrl: tr.sourceUrl || null, kind: "music" });
    } else notes.push({ code: "MUSIC_MISSING" });
  }
  const sfx = [];
  if (plan.settings.sfxEnabled !== false) {
    for (const s of plan.sfx || []) {
      if (!s || s.enabled === false || !s.resolved || s.resolved.collapsed) continue;
      const f = media.sfx && media.sfx[s.id];
      if (!f || !f.path) { notes.push({ code: "SFX_MISSING", elementId: s.id }); continue; }
      const at = Math.min(s.resolved.outAt, Math.max(0, durationFrames / FPS - 0.2));
      sfx.push({ id: s.id, path: f.path, sha: f.sha || null, startSec: r6(at), volume: s.volume });
      if (f.attribution) credits.push({ assetId: s.id, provider: "sfx", license: f.license || null, attribution: f.attribution, sourceUrl: f.sourceUrl || null, kind: "sfx" });
    }
    // A whoosh under every strong transition (zoom, whip, slide …), leading the joint slightly the way an editor
    // lays it, quiet enough to sit under the voice, and never stacked on a sound the plan already places there.
    const ws = media.transitionSfx;
    if (ws && ws.path) {
      let used = false;
      for (const t of transitions) {
        if (!t || !t.strong) continue;
        const at = r6(Math.max(0, (t.jointF - t.halfF) / FPS - 0.06));
        if (at > durationFrames / FPS - 0.3 || sfx.some((s) => Math.abs(s.startSec - at) < 0.4)) continue;
        sfx.push({ id: `sfx_${t.id}`, path: ws.path, sha: ws.sha || null, startSec: at, volume: 0.22 });
        used = true;
      }
      if (used && ws.attribution) credits.push({ assetId: "transition_whoosh", provider: "sfx", license: ws.license || null, attribution: ws.attribution, sourceUrl: ws.sourceUrl || null, kind: "sfx" });
      sfx.sort((a, b) => a.startSec - b.startSec || (a.id < b.id ? -1 : 1));
    }
  }
  return { voice: { pieces, chain }, music, sfx, credits };
}

// ---------------------------------------------------------------- layout (QA)
function buildLayout(plan, ctx, out, base, overlays, captions, mezz) {
  const elements = [];
  for (const o of overlays) {
    if (o.kind === "dip") continue;
    // A card is judged by its letters (safe area, collisions, face): its box is mostly transparent padding.
    if (o.kind === "card" && o.ink) elements.push({ id: o.id, kind: o.kind, outIn: r6(o.outInF / FPS), outOut: r6(o.outOutF / FPS), box: o.ink, frame: o.geom });
    else elements.push({ id: o.id, kind: o.kind, outIn: r6(o.outInF / FPS), outOut: r6(o.outOutF / FPS), box: o.geom });
  }
  if (captions) {
    for (const c of captions.cues) {
      if (!c.pos) continue;
      const b = cueBox(c, captions.style, { width: out.w, height: out.h }, c.pos, captions.lang);
      elements.push({ id: c.id, kind: "caption", outIn: c.resolved.outIn, outOut: c.resolved.outOut,
        box: { x: Math.round(b.x * out.w), y: Math.round(b.y * out.h), w: Math.round(b.w * out.w), h: Math.round(b.h * out.h) } });
    }
  }
  const crops = base.pieces.map((s) => {
    const face = T.faceAt(ctx.faces || null, ((s.srcInF + s.srcOutF) / 2) / FPS);
    const assumed = !ctx.faces || ctx.faces.mode === "assumed";
    const fh = face.h * mezz.h, fw = fh * 0.8;
    let crop;
    if (s.framing.crop && Number.isFinite(s.framing.crop.x)) crop = s.framing.crop;
    else if (s.framing.mode === "pan") crop = { ...s.framing.crop, x: s.framing.keyframes[0].x, y: s.framing.keyframes[0].y };
    else {
      const fp = P.fitPlacement(mezz, out);
      crop = { x: Math.round(-fp.x / fp.s), y: Math.round(-fp.y / fp.s), w: Math.round(out.w / fp.s), h: Math.round(out.h / fp.s) };
    }
    return {
      pieceId: s.id, outIn: r6(s.outInF / FPS), outOut: r6(s.outOutF / FPS), mode: s.framing.mode, layout: s.layout, ...crop,
      faceBox: assumed ? null : { x: Math.round(face.cx * mezz.w - fw / 2), y: Math.round(face.cy * mezz.h - fh / 2), w: Math.round(fw), h: Math.round(fh) },
    };
  });
  return { output: { w: out.w, h: out.h }, durationFrames: base.durationFrames, mezz: { w: mezz.w, h: mezz.h }, elements, crops };
}

// ---------------------------------------------------------------- entry
function buildComposition(plan, ctx = {}, profileName = "preview540") {
  if (!plan || !plan.output || !plan.timeline || !plan.settings) throw invalid("resolved plan required");
  const mezz = ctx.mezz && ctx.mezz.w > 0 && ctx.mezz.h > 0 ? ctx.mezz : null;
  if (!mezz) throw invalid("ctx.mezz {w,h} required");
  const prof = P.getProfile(profileName);
  const out = P.outputFor(profileName, plan.output.aspect);
  const notes = [];
  const fit = needsFit(mezz, plan.output.aspect, plan.output.background);
  const media = ctx.media || {};
  const base = buildBase(plan, { ...ctx, media }, out, fit, notes);
  const captions = captionTrack(plan, out, notes);
  const hiddenF = fullBrollSpans(plan, media, plan.output.aspect);
  // Caption boxes on screen during [inF, outF) — cards keep clear of them as well as of the face.
  const captionBoxes = (inF, outF) => {
    if (!captions) return [];
    const res = [];
    for (const c of captions.cues) {
      if (!c.pos || !c.resolved || toF(c.resolved.outOut) <= inF || toF(c.resolved.outIn) >= outF) continue;
      const b = cueBox(c, captions.style, { width: out.w, height: out.h }, c.pos, captions.lang);
      res.push({ x: b.x * out.w, y: b.y * out.h, w: b.w * out.w, h: b.h * out.h });
    }
    return res;
  };
  const faces = ctx.faces && ctx.faces.mode !== "assumed" ? ctx.faces : null;
  const place = { subs: base.pieces, faces, mezz, hiddenF, captionBoxes };
  const { overlays, cardAss, credits: overlayCredits } = buildOverlays(plan, { ...ctx, media }, out, profileName, base.durationFrames, notes, place);

  // Picture transitions at the joints between kept clips (explicit plan transitions + the cut style).
  const planned = TR.planTransitions(plan, {
    words: ctx.words || [], durationFrames: base.durationFrames, explicit: explicitTransitions(plan),
    faceCenter: (f) => {
      const b = faceOutAt(base.pieces, ctx.faces || null, mezz, out, f, []);
      return b ? { fx: r6(clamp((b.x + b.w / 2) / out.w, 0.1, 0.9)), fy: r6(clamp((b.y + b.h / 2) / out.h, 0.1, 0.9)) } : { fx: 0.5, fy: 0.4 };
    },
  });
  // A cut-style flash is a dip overlay; everything else is drawn on the base by the composite.
  for (const t of planned.filter((x) => x.dip)) {
    overlays.push({ id: t.id, kind: "dip", outInF: t.jointF - t.halfF, outOutF: t.jointF + t.halfF, geom: { x: 0, y: 0, w: out.w, h: out.h }, z: 30, fadeInF: 0, fadeOutF: 0, dip: { kind: t.kind, jointF: t.jointF, halfFrames: t.halfF } });
  }
  overlays.sort((a, b) => a.z - b.z || a.outInF - b.outInF || (a.id < b.id ? -1 : 1));
  const xfades = planned.filter((t) => !t.dip);
  const lookId = LOOKS.includes(plan.settings.look) ? plan.settings.look : "natural";
  const look = lookFilter(lookId, { w: out.w }) ? { id: lookId, filter: lookFilter(lookId, { w: out.w }) } : null;

  const audio = buildAudio(plan, { ...ctx, media }, base.durationFrames, notes, xfades);
  const layout = buildLayout(plan, ctx, out, base, overlays, captions, mezz);
  const credits = [...overlayCredits, ...audio.credits];

  const comp = {
    version: VERSION,
    profile: { name: prof.name, W: out.w, H: out.h, fps: FPS, inter: prof.inter, final: prof.final },
    durationFrames: base.durationFrames,
    fit,
    base: { pieces: base.pieces, chunks: base.chunks, key: base.key },
    transitions: xfades.map((t) => ({ id: t.id, kind: t.kind, jointF: t.jointF, halfF: t.halfF, xfade: t.xfade, blur: t.blur, zoom: t.zoom, center: t.center, origin: t.origin, strong: t.strong })),
    look,
    overlays,
    captions: captions ? { ass: captions.ass, fonts: captions.fonts, families: captions.families, assHash: captions.assHash, lang: captions.lang, cueCount: captions.cueCount } : null,
    cardAss,
    // Output-timeline cues for the SRT/VTT sidecars (same cues the ASS was built from).
    captionCues: captions ? captions.cues.map((c) => ({ id: c.id, resolved: c.resolved, lines: c.lines, text: c.text, hidden: false })) : [],
    audio: { voice: audio.voice, music: audio.music, sfx: audio.sfx },
    layout,
    credits,
    notes,
  };
  const { layout: _l, notes: _n, credits: _c, captionCues: _q, ...hashed } = comp;
  void _l; void _n; void _c; void _q;
  comp.compositionHash = fsx.sha256Json(hashed);
  return comp;
}

module.exports = { buildComposition, planHashOf, needsFit, cropAt, geomFor, pipBoxPx, cardGeom, cardInk, placeCard, faceOutAt, VERSION, UPSCALE_CAP, CHUNK_GRID_F };
