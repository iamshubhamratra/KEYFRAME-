// OM FURNITURE — the shared decorative vocabulary the Claude Design references all draw from.
//
// WHY THIS EXISTS. The fidelity audit (TEMPLATE-FIDELITY-AUDIT.md §3) measured what the ported
// packs lost against their reference. The losses are not scenes — scene coverage is near
// complete — they are the FURNITURE inside the scenes, and the same few pieces are missing over
// and over: persistent chrome in 10 of 16 packs, hand-drawn SVG in 10, blur in 7, blend modes
// in 7. Rebuilding each pack against its reference would otherwise mean writing a drifting dot
// field sixteen times. It is written once here.
//
// THE RUNTIME CONSTRAINT THAT SHAPES EVERY HELPER BELOW. The references are React components
// re-evaluated every frame, so they can feed a live clock straight into a style:
//
//     const bob = Math.sin(clock * 0.8 + seed) * 6;      // Edition, Plate
//
// KEYFRAME renders through HyperFrames, which SEEKS one paused GSAP timeline. There is no
// per-frame evaluation to hook. So every continuous motion here is a REPEATING TWEEN tracing
// the same curve: same amplitude, same period, same easing. `sine.inOut` + `yoyo` is exactly a
// sine wave, so a bob of amplitude A and period P is `yoyo` over P/2 at amplitude 2A.
//
// FOUR RULES, each one a bug already paid for elsewhere in this codebase:
//   1. GPU-FRIENDLY PROPERTIES ONLY — transform, opacity, filter, clip-path. Animating a layout
//      property reflows a 1080x1920 Chromium capture on every frame.
//   2. ONE TWEEN PER ELEMENT+PROPERTY. Two tweens fighting over one property is a seek-order
//      hazard, not a lint nit. Where a piece needs two axes it gets two nested wrappers.
//   3. FINITE REPEATS VIA FLOOR (`reps`), never ceil — a ceil'd cycle runs past its clip.
//   4. NEVER INLINE `transform:` ON A TWEENED ELEMENT — GSAP replaces the whole property. Use
//      the standalone `translate:` / `rotate:` for static offsets.
//
// SEAMLESS LOOPS. A drifting field only reads as continuous if one cycle lands exactly one tile
// on. Every drift helper below translates by precisely one tile and repeats, so there is no
// visible snap at the wrap.

const { r, esc, hexToRgb } = require("./composer_kit");

// Deliberately duplicated rather than imported from om_port_kit: that module re-exports THIS
// one, and a cycle between them resolves to a half-built export object at load time. It is two
// lines. `transition_kit` carries its own copy for exactly the same reason.
const rgba = (h, a) => { const [R, G, B] = hexToRgb(h); return `rgba(${R},${G},${B},${a})`; };

// Finite repeat count for a cycle of `dur` inside a span of `span`. Duplicated from om_port_kit
// (it is one line) rather than imported: om_port_kit re-exports THIS module, and a cycle between
// them would resolve to a half-built export object at load time.
const reps = (span, dur) => Math.max(0, Math.floor(span / Math.max(0.001, dur)) - 1);

// ── ambient: drifting dot field ──────────────────────────────────────────────
// Reference: Edition LiveBG — a 34px radial-dot grid creeping diagonally under the page.
// Two axes means two tweens, so the field is nested: the outer box carries x, the inner y.
// The tile is oversized by one period on each axis so the wrap is never visible at the edge.
function dotField(th, { cls, U, color = null, tile = 34, dot = 1.6, opacity = 0.7, xDur = 2.4, yDur = 3.8 }) {
  const ink = color || th.ink;
  return `<div class="${cls}-dx" style="position:absolute;inset:${r(-U(tile * 2))}cqw;pointer-events:none;">
    <div class="${cls}-dy" style="position:absolute;inset:0;background-image:radial-gradient(${rgba(ink, 0.06)} ${r(U(dot))}cqw, transparent ${r(U(dot))}cqw);background-size:${r(U(tile))}cqw ${r(U(tile))}cqw;opacity:${r(opacity)};"></div>
  </div>`;
}
const dotFieldTweens = (ctx, { cls, U, tile = 34, xDur = 2.4, yDur = 3.8 }) => [
  `tl.fromTo(".${cls}-dx",{x:0},{x:"${r(U(tile))}cqw",duration:${r(xDur)},ease:"none",repeat:${reps(ctx.L, xDur)}},${r(ctx.T)});`,
  `tl.fromTo(".${cls}-dy",{y:0},{y:"${r(U(tile))}cqw",duration:${r(yDur)},ease:"none",repeat:${reps(ctx.L, yDur)}},${r(ctx.T)});`,
];

// ── ambient: drifting column rules ───────────────────────────────────────────
// Reference: Edition LiveBG — the 12-column measure of the page, creeping sideways. Drawn one
// column wider than the stage so the group can translate a full column and still cover.
function columnRules(th, { cls, U, stageW = 1920, cols = 12, color = null, alpha = 0.05, top = 0, bottom = 0 }) {
  const ink = color || th.ink, colW = stageW / cols;
  const lines = Array.from({ length: cols + 2 }, (_, i) =>
    `<line x1="${r(i * colW)}" y1="0" x2="${r(i * colW)}" y2="1080" stroke="${rgba(ink, alpha)}" stroke-width="1"></line>`).join("");
  return `<svg class="${cls}-cols" width="100%" height="100%" viewBox="0 0 ${stageW} 1080" preserveAspectRatio="none" style="position:absolute;left:${r(-U(colW))}cqw;top:${r(top)}cqw;bottom:${r(bottom)}cqw;width:calc(100% + ${r(U(colW))}cqw);pointer-events:none;overflow:visible;">${lines}</svg>`;
}
const columnRulesTweens = (ctx, { cls, U, stageW = 1920, cols = 12, dur = 16 }) =>
  [`tl.fromTo(".${cls}-cols",{x:0},{x:"${r(U(stageW / cols))}cqw",duration:${r(dur)},ease:"none",repeat:${reps(ctx.L, dur)}},${r(ctx.T)});`];

// ── ambient: registration marks ──────────────────────────────────────────────
// Reference: Edition LiveBG — printer's crosshairs pulsing at the page corners. `pts` are
// AUTHORED PIXELS in the reference's own coordinate space, so a pack transcribes them verbatim.
function regMarks(th, { cls, pts, color = null, arm = 12, ring = 7, stageW = 1920, stageH = 1080 }) {
  const c = color || th.accent;
  const g = pts.map((p, i) => `<g class="${cls}-reg" stroke="${c}" stroke-width="1.5" fill="none" opacity="${r(0.2 + (i % 2) * 0.2)}">
    <line x1="${p[0] - arm}" y1="${p[1]}" x2="${p[0] + arm}" y2="${p[1]}"></line>
    <line x1="${p[0]}" y1="${p[1] - arm}" x2="${p[0]}" y2="${p[1] + arm}"></line>
    <circle cx="${p[0]}" cy="${p[1]}" r="${ring}"></circle>
  </g>`).join("");
  return `<svg width="100%" height="100%" viewBox="0 0 ${stageW} ${stageH}" style="position:absolute;inset:0;pointer-events:none;overflow:visible;">${g}</svg>`;
}
// Period 2.618s in the reference (sin(clock*2.4)); a yoyo covers a full wave in 2x the tween.
const regMarkTweens = (ctx, { cls, dur = 1.31 }) =>
  [`tl.to(".${cls}-reg",{opacity:0.7,duration:${r(dur)},ease:"sine.inOut",repeat:${reps(ctx.L, dur)},yoyo:true,stagger:${r(dur / 3)}},${r(ctx.T)});`];

// ── ambient: rotating dashed rings ───────────────────────────────────────────
// Reference: Edition LiveBG — the press's alignment discs, turning slowly behind the page.
// transformOrigin does NOT map into an SVG viewBox; GSAP's `svgOrigin` does. That distinction
// cost a whole render pass on drive's speedometer.
function dashRings(th, { cls, cx, cy, rings = [], stageW = 1920, stageH = 1080, opacity = 0.07 }) {
  const c = rings.map((g) => `<circle r="${g.r}" fill="none" stroke="${g.color || th.ink}" stroke-width="${g.w || 1.5}" stroke-dasharray="${g.dash || "14 20"}"></circle>`).join("");
  return `<svg width="100%" height="100%" viewBox="0 0 ${stageW} ${stageH}" style="position:absolute;inset:0;pointer-events:none;overflow:visible;">
    <g class="${cls}-ring" transform="translate(${cx} ${cy})" opacity="${r(opacity)}">${c}</g>
  </svg>`;
}
const dashRingTweens = (ctx, { cls, cx, cy, dur = 60 }) =>
  [`tl.fromTo(".${cls}-ring",{rotation:0},{rotation:360,duration:${r(dur)},ease:"none",repeat:${reps(ctx.L, dur)},svgOrigin:"${r(cx)} ${r(cy)}"},${r(ctx.T)});`];

// ── chrome: scrolling marquee ────────────────────────────────────────────────
// Reference: Edition Marquee — the masthead repeated along the page foot, always moving. The
// line is repeated enough times to overfill the stage, then translated by exactly one unit.
function marquee(th, { cls, U, text, y, size = 15, tracking = 0.18, alpha = 0.55, unit = 1200, reps: n = 8 }) {
  const one = `${esc(text)}   —   `;
  return `<div style="position:absolute;left:0;right:0;top:${r(y)}cqw;height:${r(U(26))}cqw;overflow:hidden;display:flex;align-items:center;pointer-events:none;">
    <div class="${cls}-mq" style="white-space:nowrap;font-family:${th.monoStack};font-weight:700;font-size:${r(U(size))}cqw;letter-spacing:${tracking}em;color:${rgba(th.ink, alpha)};text-transform:uppercase;">${one.repeat(n)}</div>
  </div>`;
}
// Reference scrolls 90px/s over a 1200px unit — one cycle is unit/90 seconds.
const marqueeTweens = (ctx, { cls, U, unit = 1200, speed = 90 }) => {
  const dur = unit / speed;
  return [`tl.fromTo(".${cls}-mq",{x:0},{x:"${r(-U(unit))}cqw",duration:${r(dur)},ease:"none",repeat:${reps(ctx.L, dur)}},${r(ctx.T)});`];
};

// ── chrome: masthead ─────────────────────────────────────────────────────────
// Reference: Edition Chrome — brand left, an italic section label centred, the url right, on
// EVERY page. Ten of sixteen packs lost their equivalent, which is the single biggest reason a
// beat reads as a standalone slide rather than a page of one publication.
function masthead(th, { U, y, pad, left, mid, right, size = 15, tracking = 0.16, midStack = null, midSize = 18 }) {
  const cell = (t) => `<span>${esc(String(t || ""))}</span>`;
  return `<div style="position:absolute;top:${r(y)}cqw;left:${r(pad)}cqw;right:${r(pad)}cqw;display:flex;justify-content:space-between;align-items:baseline;font-family:${th.monoStack};font-weight:800;font-size:${r(U(size))}cqw;letter-spacing:${tracking}em;text-transform:uppercase;color:${th.ink};pointer-events:none;">
    ${cell(left)}
    ${mid ? `<span style="font-family:${midStack || th.bodyStack};font-style:italic;font-weight:500;letter-spacing:0.02em;text-transform:none;font-size:${r(U(midSize))}cqw;color:${th.sub};">${esc(String(mid))}</span>` : "<span></span>"}
    ${cell(right)}
  </div>`;
}

// ── plate: bordered, captioned, alive ────────────────────────────────────────
// Reference: Edition Plate — a printed figure. The caption bar sits INSIDE the keyline as part
// of the plate, which is why the reference can stack plates 28px apart without a caption ever
// being covered. Our port put the caption outside and had to re-space the whole spread to
// compensate; moving it back inside restores the reference geometry exactly.
//
// Returns "" without a picture. THE FIRST LAW: never draw an empty container. The reference
// ships a hatched "DROP IMAGE TO REPLACE" placeholder, which is right for a design handoff and
// wrong for a customer's delivered film.
function figPlate(th, { cls, U, x, y, w, h, shot, fig, label, border = 2, capSize = 13, shotFill }) {
  if (!shot || !shot.path) return "";
  const bw = r(U(border));
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border:${bw}cqw solid ${th.ink};background:${th.bg};display:flex;flex-direction:column;opacity:0;box-sizing:border-box;">
    <div style="flex:1 1 auto;min-height:0;overflow:hidden;position:relative;">
      <div class="${cls}-rv" style="position:absolute;inset:0;clip-path:inset(0 100% 0 0);">${shotFill(shot, { bg: th.bg })}</div>
      <div class="${cls}-sh" style="position:absolute;top:0;bottom:0;left:-30%;width:22%;pointer-events:none;">
        <div style="position:absolute;inset:${r(-U(40))}cqw 0;background:linear-gradient(100deg, transparent, ${rgba("#FFFFFF", 0.35)}, transparent);mix-blend-mode:screen;transform:skewX(-12deg);"></div>
      </div>
    </div>
    <div style="flex:0 0 auto;border-top:${bw}cqw solid ${th.ink};padding:${r(U(7))}cqw ${r(U(12))}cqw;display:flex;justify-content:space-between;font-family:${th.monoStack};font-weight:700;font-size:${r(U(capSize))}cqw;letter-spacing:0.12em;text-transform:uppercase;color:${th.ink};">
      <span>FIG. ${esc(String(fig || "I"))}</span><span style="color:${th.accent};">${esc(String(label || "PLATE"))}</span>
    </div>
  </div>`;
}
// Reveal, then a continuous bob and a sweeping sheen. Three separate elements, so no two tweens
// ever contend for one property: the box carries opacity+y, the inner wrapper the clip, the
// sheen its own x.
function figPlateTweens(ctx, { cls, at, du, bob = 6, U, seed = 0, sheen = true, bobDur = 3.9, sheenDur = 5 }) {
  const t = [
    `tl.fromTo(".${cls}",{opacity:0},{opacity:1,duration:${du(0.2)},ease:"none"},${at(0)});`,
    `tl.fromTo(".${cls}-rv",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:${du(0.42)},ease:"power2.inOut"},${at(0)});`,
    `tl.to(".${cls}",{y:"${r(U(bob * 2))}cqw",duration:${r(bobDur)},ease:"sine.inOut",repeat:${reps(ctx.L, bobDur)},yoyo:true},${r(ctx.T + seed * 0.4)});`,
  ];
  if (sheen) t.push(`tl.fromTo(".${cls}-sh",{x:0},{x:"${r(U(1200))}cqw",duration:${r(sheenDur)},ease:"none",repeat:${reps(ctx.L, sheenDur)}},${r(ctx.T + seed * 0.6)});`);
  return t;
}

// ── headline: clip-wipe reveal + breathing measure ───────────────────────────
// Reference: Edition ClipHead — the headline is EXPOSED left-to-right like a press plate, not
// slid up. Underneath sits a short accent measure whose width breathes off the clock. Both are
// signature; a yPercent slide reads as a generic kinetic-type entrance instead.
function clipHead(th, { cls, U, x, y, w, lines, size, lh = 0.9, color = null, tracking = -0.02, font = null, measure = true, measureMax = 340 }) {
  const body = (Array.isArray(lines) ? lines : [lines]).map((l) => `<span style="display:block;">${esc(l)}</span>`).join("");
  return `<div style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;">
    <div class="${cls}-ch" style="clip-path:inset(0 100% 0 0);font-family:${font || th.displayStack};font-size:${r(size)}cqw;line-height:${lh};letter-spacing:${tracking}em;text-transform:uppercase;color:${color || th.ink};">${body}</div>
    ${measure ? `<div style="margin-top:${r(U(14))}cqw;height:${r(U(6))}cqw;width:${r(Math.min(w, U(measureMax)))}cqw;overflow:hidden;"><div class="${cls}-ms" style="width:100%;height:100%;background:${th.accent};transform-origin:left center;opacity:0;"></div></div>` : ""}
  </div>`;
}
function clipHeadTweens(ctx, { cls, at, du, measure = true, dur = 0.42, msDur = 1.96 }) {
  const t = [`tl.fromTo(".${cls}-ch",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:${du(dur)},ease:"power2.inOut"},${at(0.04)});`];
  // The measure BREATHES between 0.6 and 1.0 of its width (reference: 0.6 + 0.4*sin(clock*1.6)).
  // Its start value is set by the tween, never inline — a CSS `scale:` and a GSAP `scaleX` both
  // apply, so declaring it in markup as well would scale the bar twice.
  if (measure) t.push(
    `tl.fromTo(".${cls}-ms",{opacity:0},{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.14)});`,
    `tl.fromTo(".${cls}-ms",{scaleX:0.6},{scaleX:1,duration:${r(msDur)},ease:"sine.inOut",repeat:${reps(ctx.L, msDur)},yoyo:true},${r(ctx.T)});`,
  );
  return t;
}

// ── decorative: drifting oversized numeral ───────────────────────────────────
// Reference: Edition GhostNum — a 620px issue number ghosted into the page at 6% ink, drifting
// and rocking. Two axes of motion, so two nested wrappers (rule 2).
function ghostNum(th, { cls, U, text, x = null, y, right = null, size, color = null, lh = 0.8, font = null }) {
  const pos = right != null ? `right:${r(right)}cqw;` : `left:${r(x || 0)}cqw;`;
  return `<div class="${cls}-gy" style="position:absolute;${pos}top:${r(y)}cqw;pointer-events:none;">
    <div class="${cls}-gr" style="font-family:${font || th.displayStack};font-size:${r(size)}cqw;line-height:${lh};color:${color || rgba(th.ink, 0.06)};">${esc(String(text))}</div>
  </div>`;
}
const ghostNumTweens = (ctx, { cls, U, amp = 14, rot = 1.5, yDur = 6.3, rDur = 7.9 }) => [
  `tl.to(".${cls}-gy",{y:"${r(U(amp * 2))}cqw",duration:${r(yDur)},ease:"sine.inOut",repeat:${reps(ctx.L, yDur)},yoyo:true},${r(ctx.T)});`,
  `tl.fromTo(".${cls}-gr",{rotation:${r(-rot)}},{rotation:${r(rot)},duration:${r(rDur)},ease:"sine.inOut",repeat:${reps(ctx.L, rDur)},yoyo:true},${r(ctx.T)});`,
];

module.exports = {
  reps,
  dotField, dotFieldTweens,
  columnRules, columnRulesTweens,
  regMarks, regMarkTweens,
  dashRings, dashRingTweens,
  marquee, marqueeTweens,
  masthead,
  figPlate, figPlateTweens,
  clipHead, clipHeadTweens,
  ghostNum, ghostNumTweens,
};
