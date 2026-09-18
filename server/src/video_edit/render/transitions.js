// VIDEO EDIT TRANSITIONS — real picture transitions at the joints between kept clips (RENDER.md §5, "transitions").
//
// WHY THIS EXISTS. Every cut in an AI edit (a removed silence, filler, retake or off-topic stretch) is a joint where
// the source jumps. Until now those joints were hard cuts, and the plan's only transitions were short dips to
// black/white laid OVER the joint, because the renderer's frame-exact model never has two clips on screen at once
// (the voice stem is cut sample-exactly to the same joints, so overlapping clips would drift the lips off the words).
// This module gives the edit real transitions — crossfade, zoom, whip, slide, blur, circle, pixelate — WITHOUT
// breaking that model: each side of a joint is extended by a FROZEN handle (tpad clone of its last / first frame)
// and the two extended sides are cross-transitioned with ffmpeg `xfade` centred on the joint. The outgoing clip
// plays in real time up to the joint, the incoming clip plays in real time from the joint, so every frame after
// the transition window is exactly where it was and the output keeps its frame count (proved in the tests).
//
// WHERE TRANSITIONS COME FROM (one list, deterministic):
//   1. plan.transitions — the director's / the person's explicit transitions (topic changes). Dip kinds stay dips
//      (compose renders those as overlays); every other non-CUT kind becomes an xfade here.
//   2. settings.cutTransition — the style applied at EVERY other joint between two kept clips:
//        none   hard cuts (the old behaviour)
//        smooth a short crossfade that softens each jump cut
//        zoom | whip | slide | blur | flash   that transition at every joint
//        auto   (default, also for plans written before this setting existed) — a soft crossfade inside a
//               sentence (a removed filler / pause) and a stronger, varied transition where a new sentence starts,
//               rationed so the video never turns into a slideshow.
//   Joints hidden under full-screen B-roll get nothing (the viewer cannot see them), windows never overlap, and a
//   joint too close to the start or end of the video is left a cut.
//
// CONTRACT:
//   XFADE_KINDS · DIP_KINDS · CUT_STYLES · STRONG_KINDS
//   isXfadeKind(kind) -> boolean
//   timelineJoints(plan, words) -> [{ jointF, prevPieceId, nextPieceId, sentenceStart, gapSec }]
//   planTransitions(plan, { words, durationFrames, explicit:[{ id, kind, jointF, durationSec }], faceCenter?(f) })
//     -> [{ id, kind, jointF, halfF, xfade, blur, zoom, center:{fx,fy}, dip, origin:'plan'|'cut', strong }]
//        sorted by jointF, non-overlapping; `dip` entries (the flash style) are overlays for compose, not xfades
//   xfadeGraph({ inLabel, outLabel, transitions, durationFrames, out:{w,h} }) -> filtergraph text ("" when none)
//     Splits the input at the joints, pads each side with frozen handles and chains xfade; whips / slides add a
//     directional motion blur over their window, zoom punches a face-centred scale. Output has exactly
//     `durationFrames` frames.

const FPS = 30;

// kind -> the xfade transition that draws it, its default length, and an optional directional motion blur.
const XFADE_KINDS = Object.freeze({
  CROSSFADE: Object.freeze({ xfade: "fade", sec: 0.3, blur: null, label: "Crossfade" }),
  // xfade's own `zoomin` dives into the frame CENTRE (a talking head's chest) and smears; ours is a crossfade with a
  // quick scale punch aimed at the face (see xfadeGraph).
  ZOOM_IN: Object.freeze({ xfade: "fade", sec: 0.35, blur: null, zoom: 0.24, label: "Zoom" }),
  WHIP_LEFT: Object.freeze({ xfade: "slideleft", sec: 0.3, blur: "h", label: "Whip left" }),
  WHIP_RIGHT: Object.freeze({ xfade: "slideright", sec: 0.3, blur: "h", label: "Whip right" }),
  SLIDE_UP: Object.freeze({ xfade: "slideup", sec: 0.35, blur: "v", label: "Slide up" }),
  BLUR: Object.freeze({ xfade: "hblur", sec: 0.35, blur: null, label: "Blur" }),
  CIRCLE_OPEN: Object.freeze({ xfade: "circleopen", sec: 0.45, blur: null, label: "Circle reveal" }),
  PIXELATE: Object.freeze({ xfade: "pixelize", sec: 0.35, blur: null, label: "Pixelate" }),
});
const DIP_KINDS = Object.freeze(["DIP_BLACK", "DIP_WHITE", "FLASH"]);
const STRONG_KINDS = Object.freeze(["ZOOM_IN", "WHIP_LEFT", "WHIP_RIGHT", "SLIDE_UP", "CIRCLE_OPEN", "PIXELATE", "BLUR"]);
const CUT_STYLES = Object.freeze(["auto", "none", "smooth", "zoom", "whip", "slide", "blur", "flash"]);

// A style's transition for one joint (index = the joint's position among styled joints, for variety).
const STYLE_KIND = Object.freeze({
  smooth: () => ({ kind: "CROSSFADE", sec: 0.2 }),
  zoom: () => ({ kind: "ZOOM_IN", sec: 0.3 }),
  whip: (i) => ({ kind: i % 2 ? "WHIP_RIGHT" : "WHIP_LEFT", sec: 0.28 }),
  slide: () => ({ kind: "SLIDE_UP", sec: 0.3 }),
  blur: () => ({ kind: "BLUR", sec: 0.3 }),
  flash: () => ({ kind: "FLASH", sec: 0.12 }),
});
// Auto: what a new sentence opens with, in rotation (dynamic edits rotate through more of them).
const AUTO_STRONG = Object.freeze({ subtle: ["ZOOM_IN", "CROSSFADE"], dynamic: ["ZOOM_IN", "WHIP_LEFT", "SLIDE_UP", "WHIP_RIGHT"] });
const AUTO_SOFT_SEC = 0.16;          // inside a sentence: a few frames, just enough to melt the jump
const AUTO_SENTENCE_SEC = 0.3;
const AUTO_STRONG_MIN_GAP_SEC = 3.0; // a strong transition at most every 3 s …
const AUTO_STRONG_PER_10S = 2;       // … and at most two in any 10 s
const EDGE_GUARD_F = 6;              // no transition window within 6 frames of the start / end
const MIN_WINDOW_GAP_F = 4;          // at least 4 untouched frames between two transition windows
const MIN_HALF_F = 2;

const isXfadeKind = (k) => Object.prototype.hasOwnProperty.call(XFADE_KINDS, k);
const toF = (t) => Math.round(Number(t) * FPS);
const halfOf = (sec) => Math.max(MIN_HALF_F, Math.round((Number(sec) * FPS) / 2));
const SENTENCE_END_RE = /[.!?…。！？]["')\]]*$/;

// Joints between consecutive PLAY pieces of the resolved timeline (a hold / speed piece is an effect, not a cut).
function timelineJoints(plan, words = []) {
  const pieces = (plan && plan.timeline && plan.timeline.pieces) || [];
  const ws = Array.isArray(words) ? words.filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end)) : [];
  const out = [];
  for (let i = 0; i + 1 < pieces.length; i++) {
    const a = pieces[i], b = pieces[i + 1];
    if (a.kind !== "play" || b.kind !== "play") continue;
    const gapSec = Number(b.srcIn) - Number(a.srcOut);
    if (!(gapSec > 1 / FPS)) continue;   // contiguous source: not a cut
    // Did the removed stretch end a sentence? The last word kept before the joint closes one, or the next kept word
    // belongs to another sentence.
    let before = null, after = null;
    for (const w of ws) {
      if (w.end <= a.srcOut + 0.02) before = w;
      else if (!after && w.start >= b.srcIn - 0.02) after = w;
    }
    const sentenceStart = !!(before && ((before.sentenceId && after && after.sentenceId && before.sentenceId !== after.sentenceId)
      || SENTENCE_END_RE.test(String(before.text || "").trim())));
    out.push({ jointF: toF(a.outOut), prevPieceId: a.id, nextPieceId: b.id, sentenceStart, gapSec: Math.round(gapSec * 1000) / 1000 });
  }
  return out;
}

// Output-time spans covered by full-screen B-roll: a joint under one is invisible.
function fullBrollSpansF(plan) {
  const out = [];
  for (const b of plan.broll || []) {
    if (!b || b.status === "removed" || b.status === "missing" || b.layout !== "FULL") continue;
    if (!b.resolved || b.resolved.collapsed) continue;
    out.push([toF(b.resolved.outIn), toF(b.resolved.outOut)]);
  }
  return out;
}

function planTransitions(plan, { words = [], durationFrames, explicit = [], faceCenter = null } = {}) {
  const N = Number(durationFrames) || 0;
  if (N <= 2 * EDGE_GUARD_F) return [];
  const settings = plan.settings || {};
  const style = CUT_STYLES.includes(settings.cutTransition) ? settings.cutTransition : "auto";
  const hidden = fullBrollSpansF(plan);
  const underBroll = (f) => hidden.some(([a, b]) => f > a - 2 && f < b + 2);

  const wanted = [];
  // 1. explicit xfade transitions from the plan
  for (const t of explicit) {
    if (!t || !isXfadeKind(t.kind) || !Number.isFinite(t.jointF)) continue;
    const spec = XFADE_KINDS[t.kind];
    wanted.push({ id: t.id, kind: t.kind, jointF: t.jointF, halfF: halfOf(t.durationSec || spec.sec), origin: "plan", priority: 2 });
  }
  const claimed = (f) => explicit.some((t) => t && Number.isFinite(t.jointF) && Math.abs(t.jointF - f) <= 6);

  // 2. the cut style at every other joint
  if (style !== "none") {
    const joints = timelineJoints(plan, words);
    const level = settings.effects === "dynamic" ? "dynamic" : "subtle";
    const rota = AUTO_STRONG[level];
    let strongIdx = 0, styledIdx = 0;
    const strongAt = [];
    for (const j of joints) {
      if (claimed(j.jointF) || underBroll(j.jointF)) continue;
      let pick;
      if (style === "auto") {
        pick = { kind: "CROSSFADE", sec: AUTO_SOFT_SEC };
        if (j.sentenceStart) {
          const t = j.jointF / FPS;
          const recent = strongAt.filter((x) => t - x < 10);
          const spaced = !strongAt.length || t - strongAt[strongAt.length - 1] >= AUTO_STRONG_MIN_GAP_SEC;
          if (spaced && recent.length < AUTO_STRONG_PER_10S) {
            const kind = rota[strongIdx % rota.length];
            strongIdx++;
            strongAt.push(t);
            pick = { kind, sec: kind === "CROSSFADE" ? AUTO_SENTENCE_SEC : XFADE_KINDS[kind].sec * 0.85, zoom: level === "subtle" ? 0.16 : null };
          }
        }
      } else {
        pick = STYLE_KIND[style](styledIdx);
      }
      styledIdx++;
      if (!isXfadeKind(pick.kind)) {
        // flash style: a dip overlay, drawn by compose; recorded here so compose knows where
        wanted.push({ id: `trc_${j.jointF}`, kind: pick.kind, jointF: j.jointF, halfF: halfOf(pick.sec), origin: "cut", priority: 1, dip: true });
        continue;
      }
      wanted.push({ id: `trc_${j.jointF}`, kind: pick.kind, jointF: j.jointF, halfF: halfOf(pick.sec), origin: "cut", priority: 1, zoom: pick.zoom || null });
    }
  }

  // Keep windows inside the video and apart from each other; explicit ones win a conflict.
  wanted.sort((a, b) => b.priority - a.priority || a.jointF - b.jointF);
  const kept = [];
  for (const w of wanted) {
    let half = w.halfF;
    // shrink a window that would cross the edge guard, drop it when even the minimum does not fit
    half = Math.min(half, w.jointF - EDGE_GUARD_F, N - EDGE_GUARD_F - w.jointF);
    if (half < MIN_HALF_F) continue;
    const lo = w.jointF - half, hi = w.jointF + half;
    const clash = kept.some((k) => lo < k.jointF + k.halfF + MIN_WINDOW_GAP_F && hi > k.jointF - k.halfF - MIN_WINDOW_GAP_F);
    if (clash) continue;
    kept.push({ ...w, halfF: half });
  }
  kept.sort((a, b) => a.jointF - b.jointF);
  return kept.map((k) => ({
    id: k.id, kind: k.kind, jointF: k.jointF, halfF: k.halfF, origin: k.origin, dip: !!k.dip,
    xfade: k.dip ? null : XFADE_KINDS[k.kind].xfade, blur: k.dip ? null : XFADE_KINDS[k.kind].blur,
    zoom: k.dip || !XFADE_KINDS[k.kind].zoom ? null : (k.zoom || XFADE_KINDS[k.kind].zoom),
    center: faceCenter ? faceCenter(k.jointF) : { fx: 0.5, fy: 0.4 },
    strong: STRONG_KINDS.includes(k.kind),
  }));
}

const secs = (f) => (Math.round((f / FPS) * 1e6) / 1e6).toFixed(6);

// The xfade chain for the xfade transitions (dips are overlays, drawn elsewhere).
function xfadeGraph({ inLabel, outLabel, transitions, durationFrames, out }) {
  const T = (transitions || []).filter((t) => t && t.xfade);
  if (!T.length) return "";
  const N = durationFrames;
  const lines = [];
  const seg = T.length + 1;
  lines.push(`[${inLabel}]split=${seg}${Array.from({ length: seg }, (_, i) => `[${outLabel}_s${i}]`).join("")}`);
  for (let i = 0; i < seg; i++) {
    const startF = i === 0 ? 0 : T[i - 1].jointF;
    const endF = i === T.length ? N : T[i].jointF;
    const padIn = i === 0 ? 0 : T[i - 1].halfF;
    const padOut = i === T.length ? 0 : T[i].halfF;
    const pads = [
      padIn ? `start_mode=clone:start=${padIn}` : "",
      padOut ? `stop_mode=clone:stop=${padOut}` : "",
    ].filter(Boolean).join(":");
    lines.push(`[${outLabel}_s${i}]trim=start_frame=${startF}:end_frame=${endF},setpts=PTS-STARTPTS${pads ? `,tpad=${pads}` : ""},settb=1/${FPS},setpts=N[${outLabel}_p${i}]`);
  }
  let acc = `${outLabel}_p0`;
  const post = T.some((x) => x.blur || x.zoom);
  T.forEach((t, i) => {
    const label = i === T.length - 1 && !post ? outLabel : `${outLabel}_x${i + 1}`;
    lines.push(`[${acc}][${outLabel}_p${i + 1}]xfade=transition=${t.xfade}:duration=${secs(2 * t.halfF)}:offset=${secs(t.jointF - t.halfF)}[${label}]`);
    acc = label;
  });
  const W = out && out.w ? out.w : 1080, H = out && out.h ? out.h : 1920;
  const chain = [];
  const zooms = T.filter((t) => t.zoom);
  if (zooms.length) {
    // Zoom punch: the picture scales up toward the face as the clips cross (peak at the joint) and settles back,
    // one per-frame scale + a fixed-size crop anchored on the face. Outside every window z = 1, so the frame passes
    // through at its own size and position.
    const inWin = (t) => `between(n,${t.jointF - t.halfF},${t.jointF + t.halfF - 1})`;
    const Z = zooms.map((t) => `${inWin(t)}*${t.zoom}*(1-abs(n-${t.jointF})/${t.halfF})`).join("+");
    const any = zooms.map(inWin).join("+");
    const fx = zooms.map((t) => `${inWin(t)}*${Number(t.center && t.center.fx != null ? t.center.fx : 0.5).toFixed(4)}`).join("+");
    const fy = zooms.map((t) => `${inWin(t)}*${Number(t.center && t.center.fy != null ? t.center.fy : 0.4).toFixed(4)}`).join("+");
    chain.push(`scale=w='trunc(iw*(1+${Z})/2)*2':h='trunc(ih*(1+${Z})/2)*2':eval=frame`);
    chain.push(`crop=${W}:${H}:x='(in_w-${W})*(${fx}+(1-(${any}))*0.5)':y='(in_h-${H})*(${fy}+(1-(${any}))*0.5)'`);
  }
  const blurred = T.filter((t) => t.blur);
  if (blurred.length) {
    // Motion blur over each whip / slide: a light blur across the whole window and a heavier one at its centre,
    // along the direction of travel. `n` is the output frame number, so the windows are exact.
    for (const t of blurred) {
      const a = t.jointF - t.halfF, b = t.jointF + t.halfF - 1;
      const ca = t.jointF - Math.max(1, Math.floor(t.halfF / 2)), cb = t.jointF + Math.max(0, Math.floor(t.halfF / 2) - 1);
      const light = Math.max(2, Math.round((t.blur === "h" ? W : H) * 0.012));
      const heavy = Math.max(3, Math.round((t.blur === "h" ? W : H) * 0.03));
      const dir = (r) => (t.blur === "h" ? `sizeX=${r}:sizeY=1` : `sizeX=1:sizeY=${r}`);
      chain.push(`avgblur=${dir(light)}:enable='between(n,${a},${b})'`);
      chain.push(`avgblur=${dir(heavy)}:enable='between(n,${ca},${cb})'`);
    }
  }
  if (chain.length) lines.push(`[${acc}]${chain.join(",")}[${outLabel}]`);
  return lines.join(";\n");
}

module.exports = {
  FPS, XFADE_KINDS, DIP_KINDS, STRONG_KINDS, CUT_STYLES, isXfadeKind, timelineJoints, planTransitions, xfadeGraph,
};
