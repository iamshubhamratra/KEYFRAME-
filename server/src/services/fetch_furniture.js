// FETCH FURNITURE — the park, drawn the way the reference draws it: flat SVG illustration.
//
// WHY THIS EXISTS. Our fetch painted its world in CSS — a gradient sky, a radial-gradient blob for
// the sun, a blurred gradient layer for clouds, two green bands with a scalloped top. Side by side
// with `framecheck/ref/Fetch` that reads as a pale backdrop; the reference reads as a PLACE: rolling
// hills in three greens, a picket fence running the width of the frame, grass tufts along the
// ground, trees and bushes, and a sun with twelve turning rays. Nothing in this pack is blurred —
// it is a flat vector illustration, and a soft-edged blob is the wrong material for it.
//
// GEOMETRY IS THE REFERENCE'S, VERBATIM. Every coordinate below is the reference's own 1920x1080
// space (`GROUND_Y = 748`), so the whole set is emitted as one SVG with that viewBox and needs no
// unit conversion. Sibling packs can share it: fetch-vertical wants the same world at 9:16.
//
// Its cast (dog, master, ball, dust) lives here too — see `dog()` / `master()`.

const GROUND_Y = 748;
const W = 1920, H = 1080;

// Set dressing colours. These are the reference's literals, not brand-derived: recolouring a
// picket fence or a tree trunk from the accent is how an illustrated world stops looking illustrated.
const HILL_A = "#A9D57F", HILL_B = "#9ECB72";
const TRUNK = "#9B6B3F", LEAF_A = "#6FA84A", LEAF_B = "#79B255", LEAF_C = "#83BC5F";
const RAIL = "#EFE6D2", POST = "#F7EFDD";
const SKIN = "#E8B98E", HAIR = "#5A4632", JEAN_A = "#3F4A5A", JEAN_B = "#4A576A";

const n = (v) => Math.round(v * 100) / 100;

// ---- set pieces --------------------------------------------------------------

const sky = (id, th) => `<defs><linearGradient id="${id}-skyG" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${th.bg}"/><stop offset="1" stop-color="${th.sky}"/>
  </linearGradient></defs>
  <rect x="0" y="0" width="${W}" height="${GROUND_Y + 40}" fill="url(#${id}-skyG)"/>`;

// The crest: a shallow Q curve over the flat fill, then a darker band 70px below it.
const ground = (th) => `<g>
    <rect x="0" y="${GROUND_Y}" width="${W}" height="${H - GROUND_Y}" fill="${th.grass}"/>
    <path d="M0 ${GROUND_Y} Q 480 ${GROUND_Y - 26} 960 ${GROUND_Y} T ${W} ${GROUND_Y} V ${H} H 0 Z" fill="${th.grass}"/>
    <rect x="0" y="${GROUND_Y + 70}" width="${W}" height="${H}" fill="${th.grassDk}" opacity="0.55"/>
  </g>`;

// Twelve rays on a turning ring, a solid disc, and a white bloom at 18%. The ring is its own group
// so the rotation cannot disturb the disc's placement — GSAP writes the whole transform property.
const sun = (id, th, x = 258, y = 206, rad = 84) => `<g transform="translate(${x} ${y})">
    <g class="${id}-rays" opacity="0.9">
      ${Array.from({ length: 12 }, (_, i) => `<rect x="-3" y="${-(rad + 46)}" width="6" height="26" rx="3" fill="${th.sun}" transform="rotate(${i * 30})"/>`).join("")}
    </g>
    <circle r="${rad}" fill="${th.sun}"/>
    <circle r="${rad}" fill="#fff" opacity="0.18"/>
  </g>`;

const cloud = (x, y, s = 1, o = 1) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}">
    <ellipse cx="0" cy="0" rx="70" ry="42" fill="#fff"/>
    <ellipse cx="60" cy="10" rx="52" ry="34" fill="#fff"/>
    <ellipse cx="-58" cy="12" rx="46" ry="30" fill="#fff"/>
    <rect x="-100" y="6" width="220" height="34" rx="17" fill="#fff"/>
  </g>`;

const hill = (x, y, w, h, color) => `<path d="M${x - w} ${y} Q ${x} ${y - h} ${x + w} ${y} Z" fill="${color}"/>`;

const tree = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-14" y="-90" width="28" height="100" rx="10" fill="${TRUNK}"/>
    <circle cx="0" cy="-120" r="66" fill="${LEAF_A}"/>
    <circle cx="-46" cy="-96" r="46" fill="${LEAF_B}"/>
    <circle cx="46" cy="-98" r="48" fill="${LEAF_B}"/>
    <circle cx="0" cy="-140" r="50" fill="${LEAF_C}"/>
  </g>`;

const bush = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="-30" cy="0" rx="34" ry="26" fill="${LEAF_B}"/>
    <ellipse cx="30" cy="0" rx="36" ry="28" fill="${LEAF_A}"/>
    <ellipse cx="0" cy="-12" rx="40" ry="32" fill="${LEAF_C}"/>
  </g>`;

// Two rails and `posts` uprights. The reference runs 34 posts at a 70px gap from x=-40, which is
// what carries the fence clear across the frame instead of ending in mid-air.
const fence = (x, y, posts = 34, gap = 70) => `<g transform="translate(${x} ${y})">
    <rect x="0" y="-46" width="${gap * (posts - 1) + 24}" height="12" rx="6" fill="${RAIL}"/>
    <rect x="0" y="-22" width="${gap * (posts - 1) + 24}" height="12" rx="6" fill="${RAIL}"/>
    ${Array.from({ length: posts }, (_, i) => `<rect x="${i * gap}" y="-64" width="16" height="72" rx="6" fill="${POST}"/>`).join("")}
  </g>`;

// A tuft is three blades. The reference sways them by moving each blade's control point; we rotate
// the whole tuft a couple of degrees about its base instead — the same read, and a `d` attribute is
// not a thing a paused timeline can interpolate cheaply.
const tuft = (id, i, x, y, color = LEAF_A) => `<g class="${id}-tuft${i % 4}" transform="translate(${x} ${y})" stroke="${color}" stroke-width="5" stroke-linecap="round" fill="none">
    <path d="M0 0 Q -6 -18 -10 -30"/><path d="M8 0 Q 8 -20 10 -34"/><path d="M-8 0 Q -10 -16 -16 -26"/>
  </g>`;

// ---- the park ----------------------------------------------------------------
// Layer order is the reference's: sky, sun, clouds, hills, ground, trees/bushes, fence, tufts.
function park(id, th, extra = "") {
  const clouds = [{ x: 620, y: 180, s: 1, o: 0.95 }, { x: 1300, y: 130, s: 1.3, o: 0.9 }, { x: 1720, y: 250, s: 0.8, o: 0.85 }];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;display:block;">
    ${sky(id, th)}
    ${sun(id, th)}
    <g class="${id}-clouds">${clouds.map((c) => cloud(c.x, c.y, c.s, c.o)).join("")}</g>
    <g>
      ${hill(300, GROUND_Y, 620, 230, HILL_A)}
      ${hill(1100, GROUND_Y, 720, 300, HILL_B)}
      ${hill(1800, GROUND_Y, 560, 210, HILL_A)}
    </g>
    ${ground(th)}
    <g opacity="0.96">
      ${tree(120, GROUND_Y + 6, 1.05)}
      ${tree(1780, GROUND_Y + 10, 1.15)}
      ${bush(640, GROUND_Y + 14, 1)}
      ${bush(1420, GROUND_Y + 16, 1.1)}
    </g>
    ${fence(-40, GROUND_Y + 30)}
    <g>${Array.from({ length: 14 }, (_, i) => tuft(id, i, 40 + i * 150, GROUND_Y + 120)).join("")}</g>
    ${extra}
  </svg>`;
}

// The sun turns at 8 deg/s (45s a revolution) and the tufts sway on a PI-second cycle. Tufts are
// bucketed into four phase groups so fourteen of them cost four tweens, not fourteen.
function parkTweens(id, ctx, K) {
  const L = ctx.L, T = ctx.T;
  const out = [
    `tl.to(".${id}-rays",{rotation:360,duration:45,ease:"none",repeat:${K.reps(L, 45)}},${K.r(T)});`,
    `tl.to(".${id}-clouds",{x:-70,duration:${K.r(Math.max(6, L * 2))},ease:"none"},${K.r(T)});`,
  ];
  for (let g = 0; g < 4; g++) {
    // Each bucket leans the other way from its neighbour, so the field does not sway as one blade.
    const dir = g % 2 ? -1 : 1;
    out.push(`tl.fromTo(".${id}-tuft${g}",{rotation:${n(-2.4 * dir)}},{rotation:${n(2.4 * dir)},duration:${K.r(Math.PI / 2)},ease:"sine.inOut",repeat:${K.reps(L, Math.PI / 2)},yoyo:true,transformOrigin:"50% 100%"},${K.r(T + g * 0.18)});`);
  }
  return out;
}

// ---- the cast ----------------------------------------------------------------
// A dog running a ball across the pasture to someone waiting for it. This is the pack — the reason
// it is called fetch — and it was absent from every beat.
//
// THE GAIT. The reference re-evaluates `phase = localTime * 8.5` every frame and puts each leg at
// `0.62 * sin(phase + offset)` radians about its hip. A paused timeline cannot call sin(), so each
// leg becomes a rotation tween about its own hip: amplitude 35.5 degrees (0.62 rad), a 0.739s
// stride (2*PI/8.5), yoyo. The near pair is exactly anti-phase, which two tweens reproduce exactly;
// the far pair is the same pair offset by 2.6 rad, which is a positive 0.306s delay.
const STRIDE = (2 * Math.PI) / 8.5;          // 0.739s
const LEG_A = (0.62 * 180) / Math.PI;        // 35.5 degrees
const HIP_Y = -58, LEG_L = 60, HIP_B = -34, HIP_F = 32;

// One leg: a bone from the hip and a paw at its end, pivoting about the hip.
const legOf = (cls, hx, color) => `<g class="${cls}">
    <line x1="${hx}" y1="${HIP_Y}" x2="${hx}" y2="${HIP_Y + LEG_L}" stroke="${color}" stroke-width="12" stroke-linecap="round"/>
    <ellipse cx="${hx}" cy="${HIP_Y + LEG_L}" rx="9" ry="5.5" fill="${color}"/>
  </g>`;

// x/y is the ground contact; the body is drawn above it in negative y, as the reference does.
function dog(id, th, { x, y, scale = 1.62, carrying = true } = {}) {
  return `<g transform="translate(${x} ${y})"><g class="${id}-dogx"><g transform="scale(${scale})">
    ${legOf(`${id}-legfb`, HIP_B, th.dogDk)}
    ${legOf(`${id}-legff`, HIP_F, th.dogDk)}
    <g class="${id}-dogbob">
      <g transform="translate(-56 -70)"><g class="${id}-tail">
        <path d="M0 0 Q -30 -8 -40 -40 Q -30 -20 0 -12 Z" fill="${th.dog}"/>
        <path d="M-34 -34 q -8 -12 -6 -22" stroke="${th.dogDk}" stroke-width="6" stroke-linecap="round" fill="none"/>
      </g></g>
      <ellipse cx="-6" cy="-66" rx="56" ry="33" fill="${th.dog}"/>
      <ellipse cx="-30" cy="-58" rx="30" ry="26" fill="${th.dogDk}" opacity="0.5"/>
      <path d="M28 -74 Q 46 -60 60 -70 L 48 -96 Q 34 -98 28 -84 Z" fill="${th.dog}"/>
      <circle cx="52" cy="-92" r="26" fill="${th.dog}"/>
      <ellipse cx="76" cy="-86" rx="20" ry="14" fill="${th.dog}"/>
      <ellipse cx="76" cy="-80" rx="20" ry="9" fill="${th.dogDk}" opacity="0.45"/>
      <circle cx="93" cy="-90" r="6" fill="${th.ink}"/>
      <circle cx="47" cy="-99" r="4" fill="${th.ink}"/>
      <g transform="translate(40 -104)"><g class="${id}-ear"><ellipse cx="0" cy="16" rx="11" ry="24" fill="${th.dogDk}"/></g></g>
      ${carrying ? `<g transform="translate(96 -78)"><circle r="15" fill="${th.accent}"/>
        <path d="M-13 -6 Q 0 4 13 -6" stroke="#fff" stroke-width="2.5" fill="none" opacity="0.8"/>
        <circle cx="-5" cy="-6" r="4" fill="#fff" opacity="0.4"/></g>` : ""}
    </g>
    ${legOf(`${id}-legnb`, HIP_B, th.dog)}
    ${legOf(`${id}-legnf`, HIP_F, th.dog)}
  </g>
  <g transform="translate(-96 -70)" stroke="${th.ink}" stroke-opacity="0.28" stroke-width="4" stroke-linecap="round">
    ${Array.from({ length: 4 }, (_, i) => `<line x1="0" y1="${-30 + i * 20}" x2="${-40 - i * 22}" y2="${-30 + i * 20}"/>`).join("")}
  </g>
  <g transform="translate(-66 6)">${Array.from({ length: 3 }, (_, i) => `<circle class="${id}-dust${i}" r="16" fill="#fff" opacity="0"/>`).join("")}</g>
  </g></g>`;
}

// The dog's own motion: the run cycle, plus the crossing itself (`spanX` user units).
function dogTweens(id, ctx, K, { spanX, from, dur }) {
  const t0 = K.r(ctx.T + from), D = K.r(dur);
  const cyc = (cls, a0, a1, hx, off = 0) =>
    `tl.fromTo(".${id}-${cls}",{rotation:${K.r(a0)}},{rotation:${K.r(a1)},duration:${K.r(STRIDE / 2)},ease:"sine.inOut",repeat:${K.reps(ctx.L, STRIDE / 2)},yoyo:true,svgOrigin:"${hx} ${HIP_Y}"},${K.r(ctx.T + off)});`;
  return [
    `tl.to(".${id}-dogx",{x:${K.r(spanX)},duration:${D},ease:"sine.inOut"},${t0});`,
    cyc("legnb", -LEG_A, LEG_A, HIP_B),
    cyc("legnf", LEG_A, -LEG_A, HIP_F),
    cyc("legfb", -LEG_A, LEG_A, HIP_B, 0.306),
    cyc("legff", LEG_A, -LEG_A, HIP_F, 0.306),
    // The body bounces once per half-stride: the reference's bob is -|sin(phase)|, never positive.
    `tl.fromTo(".${id}-dogbob",{y:0},{y:-7,duration:${K.r(STRIDE / 4)},ease:"sine.inOut",repeat:${K.reps(ctx.L, STRIDE / 4)},yoyo:true},${K.r(ctx.T)});`,
    `tl.fromTo(".${id}-tail",{rotation:-16},{rotation:16,duration:${K.r(STRIDE / 3)},ease:"sine.inOut",repeat:${K.reps(ctx.L, STRIDE / 3)},yoyo:true,svgOrigin:"0 0"},${K.r(ctx.T)});`,
    `tl.fromTo(".${id}-ear",{rotation:-4},{rotation:-36,duration:${K.r(STRIDE / 2)},ease:"sine.inOut",repeat:${K.reps(ctx.L, STRIDE / 2)},yoyo:true,svgOrigin:"0 0"},${K.r(ctx.T)});`,
    // Dust: each puff drifts back and up, swells 0.3 -> 1.4 and fades out, a third of a cycle apart.
    ...[0, 1, 2].map((i) => `tl.fromTo(".${id}-dust${i}",{x:0,y:0,scale:0.3,opacity:0.5},{x:-90,y:-20,scale:1.4,opacity:0,duration:${K.r(STRIDE)},ease:"none",repeat:${K.reps(ctx.L, STRIDE)}},${K.r(ctx.T + i * (STRIDE / 3))});`),
  ];
}

// Someone waiting with open arms, mirrored so they face the incoming dog.
function master(id, th, { x, y, scale = 1.12 } = {}) {
  return `<g transform="translate(${x} ${y}) scale(${-scale} ${scale})">
    <rect x="-26" y="-96" width="22" height="98" rx="11" fill="${JEAN_A}"/>
    <rect x="6" y="-96" width="22" height="98" rx="11" fill="${JEAN_B}"/>
    <rect x="-34" y="-186" width="70" height="104" rx="30" fill="${th.accent}"/>
    <g transform="translate(30 -170) rotate(-30)"><rect x="0" y="-9" width="78" height="20" rx="10" fill="${th.accent}"/><circle cx="80" cy="0" r="12" fill="${SKIN}"/></g>
    <circle cx="2" cy="-214" r="30" fill="${SKIN}"/>
    <path d="M-26 -226 Q 2 -256 30 -224 Q 20 -240 2 -242 Q -14 -242 -26 -226 Z" fill="${HAIR}"/>
    <circle cx="-8" cy="-214" r="3.5" fill="${th.ink}"/>
    <path d="M-14 -202 Q -4 -196 6 -202" stroke="${th.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <g transform="translate(-30 -170)"><g class="${id}-wave"><rect x="-78" y="-9" width="80" height="20" rx="10" fill="${th.accent}"/><circle cx="-80" cy="0" r="12" fill="${SKIN}"/></g></g>
  </g>`;
}
// The waving arm sits at 34 degrees and swings +/-22 on a 1.26s cycle (the reference's wave*5).
const masterTweens = (id, ctx, K) => [
  `tl.fromTo(".${id}-wave",{rotation:12},{rotation:56,duration:0.628,ease:"sine.inOut",repeat:${K.reps(ctx.L, 0.628)},yoyo:true,svgOrigin:"0 0"},${K.r(ctx.T)});`,
];

// Paw prints left along the run, appearing as the dog passes them.
function pawTrail(id, { from, to, y, count = 7 }) {
  const step = (to - from) / Math.max(1, count - 1);
  return `<g fill="${"#6B8F45"}" opacity="0.9">${Array.from({ length: count }, (_, i) => {
    const px = from + i * step, dy = i % 2 ? 16 : 0;
    return `<g class="${id}-paw" transform="translate(${n(px)} ${y + dy})" opacity="0">
      <ellipse cx="0" cy="0" rx="9" ry="7"/><circle cx="-8" cy="-9" r="3.4"/><circle cx="0" cy="-11" r="3.6"/><circle cx="8" cy="-9" r="3.4"/></g>`;
  }).join("")}</g>`;
}
const pawTweens = (id, ctx, K, { from = 0.1, dur }) => [
  `tl.fromTo(".${id}-paw",{opacity:0},{opacity:0.5,duration:${K.r(Math.min(0.5, dur / 7))},ease:"none",stagger:${K.r(dur / 7)}},${K.r(ctx.T + from)});`,
];

module.exports = {
  GROUND_Y, W, H, park, parkTweens, sun, cloud, hill, tree, bush, fence, tuft, ground,
  dog, dogTweens, master, masterTweens, pawTrail, pawTweens,
  SKIN, HAIR, JEAN_A, JEAN_B,
};
