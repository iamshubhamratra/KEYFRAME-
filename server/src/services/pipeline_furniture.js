// PIPELINE FURNITURE — the assembly-line machinery from the Claude Design reference.
//
// Pipeline is the densest ambient system in the library (23 trigonometric calls in the
// reference) and our port had none of the machine: no conveyor, no gears, no robotic arm, no
// blueprint grid. The beats were right and the factory they run in was missing.
//
// Reference: templete-design/all-template-handoffs/Pipeline/src/pipeline-film.jsx.
// All geometry is its own, in the authored 1920x1080 space. BELT_Y = 858.
//
// SEEK-SAFETY. The reference drives everything off a live clock. Here:
//   · the belt tread and rollers are ONE group translated by exactly one tread pitch, repeating
//   · gears are rotation tweens with svgOrigin (transformOrigin does NOT map into a viewBox —
//     that cost a whole render pass on drive's speedometer)
//   · the robotic arm's two-segment articulation becomes NESTED rotating groups, which is a
//     truer mechanism than the reference's inverse-kinematics-by-trig and needs no per-frame math

const { r, esc, hexToRgb } = require("./composer_kit");
const rgba = (h, a) => { const [R, G, B] = hexToRgb(h); return `rgba(${R},${G},${B},${a})`; };
const reps = (span, dur) => Math.max(0, Math.floor(span / Math.max(0.001, dur)) - 1);

const BELT_Y = 858, BELT_H = 62;

// ── gear ─────────────────────────────────────────────────────────────────────
// Reference Gear: `teeth` spokes as rounded rects around a hub, a lighter inner disc, a dark
// keyline and four bolt holes.
function gear({ cls, cx, cy, radius, teeth = 12, color, hub = null }) {
  const t = Array.from({ length: teeth }, (_, i) =>
    `<rect x="-7" y="${r(-(radius + 15))}" width="14" height="20" rx="3" fill="${color}" transform="rotate(${r(i * 360 / teeth)})"></rect>`).join("");
  const bolts = [0, 90, 180, 270].map((a) =>
    `<circle cx="${r(Math.cos(a * Math.PI / 180) * radius * 0.42)}" cy="${r(Math.sin(a * Math.PI / 180) * radius * 0.42)}" r="${r(radius * 0.09)}" fill="${hub || rgba("#000000", 0.22)}"></circle>`).join("");
  // Position lives on an untweened WRAPPER; GSAP rotates only the inner group about its own
  // origin. Mixing a set(x,y) with a rotation tween on one node makes the origin ambiguous, and
  // an inline transform on a tweened node is replaced outright.
  return `<g transform="translate(${r(cx)} ${r(cy)})"><g class="${cls}">${t}
    <circle r="${r(radius)}" fill="${color}"></circle>
    <circle r="${r(radius * 0.62)}" fill="${rgba("#FFFFFF", 0.12)}"></circle>
    <circle r="${r(radius)}" fill="none" stroke="${rgba("#000000", 0.14)}" stroke-width="3"></circle>
    ${bolts}<circle r="${r(radius * 0.16)}" fill="${hub || rgba("#000000", 0.3)}"></circle>
  </g></g>`;
}
// Rotation must use svgOrigin — the gear's own centre in USER units, not a CSS origin.
const gearTween = (ctx, { cls, dur, dir = 1 }) =>
  `tl.fromTo(".${cls}",{rotation:0},{rotation:${dir * 360},duration:${r(dur)},ease:"none",repeat:${reps(ctx.L, dur)},svgOrigin:"0 0"},${r(ctx.T)});`;

// ── conveyor belt ────────────────────────────────────────────────────────────
// Reference Belt: support legs, the belt body, a scrolling tread and spinning rollers. Tread
// pitch 44 and roller gap 150, both scrolling at 340px/s — so one tread cycle is 44/340s.
function belt(th, { cls }) {
  const legs = [220, 700, 1180, 1660].map((x) =>
    `<rect x="${x}" y="${BELT_Y + BELT_H}" width="26" height="${1080 - BELT_Y - BELT_H}" fill="${th.steelDk}"></rect>`).join("");
  // Tread and rollers are drawn one pitch wider than the stage so the group can translate a
  // full pitch and still cover — the wrap is then invisible.
  const tread = Array.from({ length: 48 }, (_, i) =>
    `<rect x="${r(i * 44 - 44)}" y="${BELT_Y + BELT_H - 16}" width="22" height="8" rx="4" fill="${rgba("#FFFFFF", 0.14)}"></rect>`).join("");
  const rollers = Array.from({ length: 15 }, (_, i) =>
    `<g transform="translate(${r(i * 150 - 150)} ${BELT_Y + BELT_H + 22})"><circle r="20" fill="${th.steelDk}"></circle>
      <line x1="-14" y1="0" x2="14" y2="0" stroke="${th.steel}" stroke-width="4"></line>
      <line x1="0" y1="-14" x2="0" y2="14" stroke="${th.steel}" stroke-width="4"></line></g>`).join("");
  return `<g>
    ${legs}
    <rect x="0" y="${BELT_Y + BELT_H + 8}" width="1920" height="10" fill="${rgba("#000000", 0.18)}"></rect>
    <rect x="-40" y="${BELT_Y}" width="2000" height="${BELT_H}" rx="8" fill="${th.belt}"></rect>
    <rect x="-40" y="${BELT_Y}" width="2000" height="10" fill="${rgba("#FFFFFF", 0.08)}"></rect>
    <g class="${cls}-tread">${tread}</g>
    <g class="${cls}-roll">${rollers}</g>
  </g>`;
}
const beltTweens = (ctx, { cls }) => {
  const treadDur = 44 / 340, rollDur = 150 / 340;
  return [
    `tl.fromTo(".${cls}-tread",{x:0},{x:44,duration:${r(treadDur)},ease:"none",repeat:${reps(ctx.L, treadDur)}},${r(ctx.T)});`,
    `tl.fromTo(".${cls}-roll",{x:0},{x:150,duration:${r(rollDur)},ease:"none",repeat:${reps(ctx.L, rollDur)}},${r(ctx.T)});`,
  ];
};

// ── robotic arm ──────────────────────────────────────────────────────────────
// Reference RoboArm articulates two segments off sin/cos. Nested rotating groups give the same
// motion as an actual mechanism — the forearm inherits the shoulder's rotation, which is what a
// real arm does and what the reference's trig was reconstructing.
function roboArm(th, { cls, baseX = 1620, baseY = 250, L1 = 220, L2 = 180 }) {
  return `<g>
    <rect x="${baseX - 40}" y="${baseY - 50}" width="80" height="50" rx="8" fill="${th.steelDk}"></rect>
    <g class="${cls}-sh">
      <line x1="${baseX}" y1="${baseY}" x2="${baseX + L1}" y2="${baseY}" stroke="${th.steel}" stroke-width="26" stroke-linecap="round"></line>
      <line x1="${baseX}" y1="${baseY}" x2="${baseX + L1}" y2="${baseY}" stroke="${rgba("#FFFFFF", 0.12)}" stroke-width="8" stroke-linecap="round"></line>
      <circle cx="${baseX}" cy="${baseY}" r="22" fill="${th.accent}"></circle>
      <g class="${cls}-fa">
        <line x1="${baseX + L1}" y1="${baseY}" x2="${baseX + L1 + L2}" y2="${baseY}" stroke="${th.steel}" stroke-width="20" stroke-linecap="round"></line>
        <circle cx="${baseX + L1}" cy="${baseY}" r="18" fill="${th.accent}"></circle>
        <g class="${cls}-gr">
          <rect x="${baseX + L1 + L2 - 6}" y="${baseY - 24}" width="10" height="34" rx="4" fill="${th.steelDk}"></rect>
          <rect x="${baseX + L1 + L2 - 6}" y="${baseY + 10}" width="10" height="34" rx="4" fill="${th.steelDk}"></rect>
        </g>
      </g>
    </g>
  </g>`;
}
const roboArmTweens = (ctx, { cls, baseX = 1620, baseY = 250, L1 = 220 }) => [
  `tl.fromTo(".${cls}-sh",{rotation:32},{rotation:48,duration:2.62,ease:"sine.inOut",repeat:${reps(ctx.L, 2.62)},yoyo:true,svgOrigin:"${baseX} ${baseY}"},${r(ctx.T)});`,
  `tl.fromTo(".${cls}-fa",{rotation:-60},{rotation:-80,duration:2.09,ease:"sine.inOut",repeat:${reps(ctx.L, 2.09)},yoyo:true,svgOrigin:"${baseX + L1} ${baseY}"},${r(ctx.T)});`,
  `tl.to(".${cls}-gr",{scaleY:1.3,duration:1.05,ease:"sine.inOut",repeat:${reps(ctx.L, 1.05)},yoyo:true,svgOrigin:"${baseX + L1 + 180} ${baseY}"},${r(ctx.T)});`,
];

// ── the factory ground ───────────────────────────────────────────────────────
// Reference MachineBG: the blueprint grid, three corner gears turning at different rates, and
// the belt — under every scene, always running.
function machineBg(th, { cls }) {
  const grid = [
    ...Array.from({ length: 24 }, (_, i) => `<line x1="${i * 80}" y1="0" x2="${i * 80}" y2="1080"></line>`),
    ...Array.from({ length: 14 }, (_, i) => `<line x1="0" y1="${i * 80}" x2="1920" y2="${i * 80}"></line>`),
  ].join("");
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none" style="position:absolute;inset:0;overflow:visible;">
      <g opacity="0.5" stroke="${rgba(th.steelDk, 0.18)}" stroke-width="1">${grid}</g>
      ${gear({ cls: `${cls}-g0`, cx: -40, cy: 520, radius: 110, teeth: 16, color: th.steel })}
      ${gear({ cls: `${cls}-g1`, cx: 96, cy: 640, radius: 56, teeth: 10, color: th.steelDk })}
      ${gear({ cls: `${cls}-g2`, cx: 1850, cy: 980, radius: 110, teeth: 16, color: th.steel })}
      ${belt(th, { cls })}
      ${roboArm(th, { cls })}
    </svg>
  </div>`;
}
// Reference gear rates: 26, -40 and -22 degrees per second.
const machineBgTweens = (ctx, { cls }) => [
  gearTween(ctx, { cls: `${cls}-g0`, dur: 360 / 26, dir: 1 }),
  gearTween(ctx, { cls: `${cls}-g1`, dur: 360 / 40, dir: -1 }),
  gearTween(ctx, { cls: `${cls}-g2`, dur: 360 / 22, dir: -1 }),
  ...beltTweens(ctx, { cls }),
  ...roboArmTweens(ctx, { cls }),
];

module.exports = { machineBg, machineBgTweens, gear, gearTween, belt, beltTweens, roboArm, roboArmTweens, BELT_Y, BELT_H };
