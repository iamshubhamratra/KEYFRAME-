// JUNGLE FURNITURE — the rainforest from the Claude Design reference.
//
// Reference: old-templete/all-template-handoffs/Jungle/src/jungle-film.jsx (JungleBG, 124-149, and
// its cast, 45-122). Every path below is the reference's own, in its authored 1920x1080 space.
//
// SEEK-SAFETY. The reference is React re-evaluated every frame and reads `Math.sin(clock * k)`
// straight into a transform. KEYFRAME seeks ONE PAUSED timeline, so each of those becomes a
// repeating `sine.inOut` yoyo tracing the same curve: a sine of amplitude A and period P is a yoyo
// of travel 2A over P/2. Amplitude and period are the reference's; only the authoring differs.
//
// ── WHERE svgOrigin IS MEASURED, AND WHY IT MATTERED ────────────────────────────────────────
// GSAP's `svgOrigin` is NOT in the SVG root's user space. `_applySVGOrigin` (gsap/src/CSSPlugin.js
// :548-575) maps the value through the INVERSE of the element's OWN transform matrix — and that
// matrix comes from `_getMatrix`, which reads the element's own `transform` attribute
// (CSSPlugin.js:517-523), never its CTM. So the value is read in the coordinate system the
// animated element's own transform maps FROM: its PARENT's user space.
//
// That distinction was silently costing this pack most of its cast. Every animated part below is
// an inner group nested inside an outer `translate(x y) scale(s)` positioning group, so its parent
// space is the ANIMAL's local space — but the tweens were passing stage coordinates (the toucan's
// wing pivoted about local (1520, 330), the tiger's tail about local (1460, 854)). Rotating about a
// point ~1500 local units away does not rotate the part, it THROWS it: at the toucan's -42deg the
// wing renders about 1100 local units below the bird, i.e. off the bottom of the frame. The wing
// was drawn, animated, and never on screen.
//
// Two rules follow, and both are load-bearing:
//   1. A part nested inside a positioning group takes its pivot in LOCAL coordinates (the wing at
//      "0 0", the monkey's tail at "22 90", the tiger's tail at "-100 -6" — unmirrored, because
//      the parent group already carries the `facing` mirror).
//   2. Anything whose WHOLE figure moves carries its own `translate(...)` and is a direct child of
//      the svg, so parent space IS stage space and the pivot can be written as the stage
//      coordinate it visibly is (the vines, the fronds). That form is also immune to the reading
//      above being wrong in either direction, which is why the fronds use it.

const { r, hexToRgb } = require("./composer_kit");
const rgba = (h, a) => { const [R, G, B] = hexToRgb(h); return `rgba(${R},${G},${B},${a})`; };
const reps = (span, dur) => Math.max(0, Math.floor(span / Math.max(0.001, dur)) - 1);

const SHAFTS = [{ x: 300, w: 150, o: 0.28 }, { x: 820, w: 190, o: 0.22 }, { x: 1380, w: 160, o: 0.26 }];
const VINES = [{ x: 140, phase: 0, len: 360, c: "c2" }, { x: 360, phase: 1.3, len: 280, c: "c1" },
  { x: 1600, phase: 0.6, len: 340, c: "c2" }, { x: 1820, phase: 2, len: 300, c: "c1" }];
const FRONDS = [{ x: 40, y: 1080, s: 1.4, rot: -12, phase: 0 }, { x: 1900, y: 1080, s: 1.5, rot: 12, phase: 1.2 }];
const FIREFLIES = [[520, 470], [1500, 520], [900, 300]];
const BUTTERFLIES = [{ x: 1300, y: 640, k: "pop" }, { x: 640, y: 700, k: "accent" }];

// Half-periods. The reference's angular rates, converted once: a `sin(clock*k)` of period 2*PI/k
// becomes a yoyo of duration PI/k.
const P = {
  vine: Math.PI / 0.8,        // sin(clock*0.8)   — 3.93s, +-22px of tip travel over the vine
  frond: Math.PI / 1.1,       // sin(clock*1.1)   — 2.86s, +-4deg about the base
  twinkle: Math.PI / 3,       // sin(clock*3)     — 1.05s, opacity 0.4..1.0
  fireflyX: Math.PI / 0.7,    // sin(clock*0.7+i) — 4.49s, +-40px
  fireflyY: Math.PI / 0.9,    // cos(clock*0.9+i) — 3.49s, +-30px
  flutterX: Math.PI / 0.9,    // sin(clock*0.9)   — 3.49s, +-60px
  flutterY: Math.PI / 1.3,    // cos(clock*1.3)   — 2.42s, +-34px
  // WING BEAT: the reference is `0.5 + 0.5*|sin(clock*6)|`. The absolute value HALVES the period —
  // |sin| completes 0 -> 1 -> 0 in PI/6, not 2*PI/6 — so the yoyo is a quarter of the raw sine
  // period, not a half. Reading past the |.| is why the wings were beating at half rate.
  wing: Math.PI / 12,         // 0.26s
  toucan: Math.PI / 5,        // sin(clock*5)     — 0.63s, wing +-22deg and a 6px body lift
  monkey: Math.PI / 1.6,      // sin(clock*1.6)   — 1.96s, +-16deg about the vine top
  tiger: Math.PI / 4,         // sin(clock*4)     — 0.79s, the gait and the tail
};

const leaf = (x, y, s, rot, color) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0 Q 40 -34 92 0 Q 40 34 0 0 Z" fill="${color}"></path><path d="M6 0 Q 46 0 86 0" stroke="${rgba("#000000", 0.16)}" stroke-width="2.5" fill="none"></path></g>`;

// Reference Frond (48-56): a spine with nine leaflet pairs, swaying +-4deg ABOUT ITS BASE. The
// group carries its own translate so the base sits at the pivot the tween names — see the header.
const frond = (cls, { x, y, s, rot }) => {
  const leaflets = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, ly = -20 - t * 200, lx = Math.sin(t * 3) * 4, tip = 34 - t * 10;
    return `<path d="M${r(lx)} ${r(ly)} q -44 -14 -70 -${r(tip)}" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"></path>
      <path d="M${r(lx)} ${r(ly)} q 44 -14 70 -${r(tip)}" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"></path>`;
  }).join("");
  return `<g class="${cls}" transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M0 0 Q 20 -110 0 -230" stroke="currentColor" stroke-width="10" fill="none" stroke-linecap="round"></path>${leaflets}
  </g>`;
};

// Reference Vine (57-61): a hanging polyline with three pods. The reference displaces each point by
// `sway * t`, which is the shape a rotation about the hanging point produces — so it rotates from
// the canopy. Direct child of the svg, so its pivot is written in stage coordinates.
const vine = (cls, v, color) => {
  const pts = Array.from({ length: 9 }, (_, i) => { const t = i / 8; return `${r(v.x + Math.sin(t * 3 + v.phase) * 16)},${r(t * v.len)}`; }).join(" ");
  const pods = [0.4, 0.7, 1].map((t) =>
    `<ellipse cx="${r(v.x + Math.sin(t * 3 + v.phase) * 16)}" cy="${r(t * v.len)}" rx="16" ry="11" fill="${color}"></ellipse>`).join("");
  return `<g class="${cls}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"></polyline>${pods}</g>`;
};

// BUTTERFLY (114-118) — wings beating on scaleX 0.5..1 while the whole insect wanders a slow
// Lissajous: +-60px in x at 6.98s and +-34px in y at 4.83s, two DIFFERENT frequencies, so it traces
// a loop rather than sliding along a diagonal.
//
// THREE GROUPS, NOT ONE. The outer group holds the anchor and is never touched. A `fromTo` on x/y
// SETS those channels outright, so animating the anchored group directly discards its
// `translate(1300 640)` and both butterflies spend the film oscillating around the stage's top-left
// corner — which is exactly what the previous inline copy of this markup did, while this correct
// helper sat in the file with no caller.
function butterfly(cls, { x, y, color }) {
  return `<g transform="translate(${r(x)} ${r(y)})"><g class="${cls}-fly">
    <g class="${cls}-wings"><ellipse cx="-9" cy="0" rx="9" ry="13" fill="${color}"></ellipse><ellipse cx="9" cy="0" rx="9" ry="13" fill="${color}"></ellipse></g>
    <rect x="-1.5" y="-10" width="3" height="20" rx="1.5" fill="#2A1A0E"></rect>
  </g></g>`;
}

// FIREFLY (119-122) — the reference drifts them as well as twinkling them: +-40px x at 8.98s,
// +-30px y at 6.98s, opacity 0.4..1.0. Same anchor discipline as the butterfly: the circle sits at
// the local origin of a group that carries the anchor, and the tween moves the circle.
const firefly = (cls, i, [x, y], color) =>
  `<g transform="translate(${x} ${y})"><circle class="${cls}-ff ${cls}-fw${i}" cx="0" cy="0" r="5" fill="${color}" opacity="0.4" style="filter:drop-shadow(0 0 6px ${color});"></circle></g>`;

function jungleBg(th, { cls }) {
  const shafts = SHAFTS.map((s) =>
    `<polygon points="${s.x},-20 ${s.x + s.w},-20 ${s.x + s.w * 2.2},1120 ${s.x + s.w * 1.1},1120" fill="${rgba("#FFF3C0", s.o)}" style="mix-blend-mode:screen;"></polygon>`).join("");
  const far = [0, 360, 720, 1080, 1440, 1800, 2160].map((bx, i) =>
    `<circle cx="${bx}" cy="${90 + (i % 3) * 30}" r="${150 + (i % 3) * 30}" fill="${th.c3}" opacity="0.8"></circle>`).join("");
  const mid = [120, 560, 1040, 1560, 2000].map((bx) =>
    `<g><rect x="${bx - 26}" y="380" width="52" height="700" rx="16" fill="${th.c2}"></rect><circle cx="${bx}" cy="360" r="130" fill="${th.c1}" opacity="0.9"></circle></g>`).join("");
  const vines = VINES.map((v, i) => vine(`${cls}-vn${i}`, v, th[v.c])).join("");
  // `currentColor` on the frond, because the group is the animated element and GSAP owns its whole
  // transform — keeping the fill off the paths that GSAP rewrites is one less thing to lose.
  const fronds = FRONDS.map((f, i) => `<g style="color:${th.c1};">${frond(`${cls}-fr${i}`, f)}</g>`).join("");
  const fireflies = FIREFLIES.map((f, i) => firefly(cls, i, f, th.accent)).join("");
  const flutter = BUTTERFLIES.map((b, i) => butterfly(`${cls}-bf${i}`, { x: b.x, y: b.y, color: th[b.k] })).join("");
  return `<div style="position:absolute;inset:0;overflow:hidden;background:linear-gradient(180deg, ${th.skyA} 0%, ${th.skyB} 100%);">
    <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none" style="position:absolute;inset:0;overflow:visible;">
      ${shafts}
      <g class="${cls}-far">${far}</g>
      <rect x="0" y="0" width="1920" height="150" fill="${th.c4}"></rect>
      <g class="${cls}-mid">${mid}</g>
      <path d="M0 900 Q 480 860 960 900 T 1920 900 V1080 H0 Z" fill="${th.c3}"></path>
      <path d="M0 980 Q 480 950 960 980 T 1920 980 V1080 H0 Z" fill="${th.c4}"></path>
      ${vines}
      ${fronds}
      ${leaf(70, 210, 1.3, 30, th.c1)}${leaf(1780, 250, 1.4, 150, th.c1)}
      ${fireflies}${flutter}
    </svg>
  </div>`;
}

// PARALLAX IS EDITORIAL IN THE REFERENCE, NOT CONSTANT. `drift` is `localTime * 60` on Discover,
// `* 40` on Trek, `* 30` on Sightings and ZERO on Enter, Census and Join (jungle-film.jsx:239, 260,
// 282) — the canopy travels on the beats that are travelling and holds still on the ones that are
// making a statement. `drift` here is that same rate in px/sec; the far canopy takes 0.2 of it and
// the mid trees 0.45, exactly as JungleBG:125 does.
const jungleTweens = (ctx, { cls, drift = 0 }) => {
  const L = Math.max(0.4, ctx.L), T = ctx.T;
  const t = [];
  if (drift > 0) {
    t.push(`tl.fromTo(".${cls}-far",{x:0},{x:${r(-drift * 0.2 * L)},duration:${r(L)},ease:"none"},${r(T)});`);
    t.push(`tl.fromTo(".${cls}-mid",{x:0},{x:${r(-drift * 0.45 * L)},duration:${r(L)},ease:"none"},${r(T)});`);
  }
  // Twinkle: one tween for all three, staggered, because the reference's `+ i * 1.7` phase offset
  // only ever means "they are not in unison".
  t.push(`tl.fromTo(".${cls}-ff",{opacity:0.4},{opacity:1,duration:${r(P.twinkle)},ease:"sine.inOut",repeat:${reps(L, P.twinkle)},yoyo:true,stagger:0.37},${r(T)});`);
  FIREFLIES.forEach((f, i) => {
    t.push(`tl.fromTo(".${cls}-fw${i}",{x:-40},{x:40,duration:${r(P.fireflyX)},ease:"sine.inOut",repeat:${reps(L, P.fireflyX)},yoyo:true},${r(T + i * 0.31)});`);
    // cos starts at its maximum, so the y leg runs +30 -> -30 rather than the other way about.
    t.push(`tl.fromTo(".${cls}-fw${i}",{y:30},{y:-30,duration:${r(P.fireflyY)},ease:"sine.inOut",repeat:${reps(L, P.fireflyY)},yoyo:true},${r(T + i * 0.24)});`);
  });
  VINES.forEach((v, i) => {
    // 22px of tip travel over a `len`-long vine is atan(22/len) at the hanging point.
    const deg = r((Math.atan2(22, v.len) * 180) / Math.PI);
    t.push(`tl.fromTo(".${cls}-vn${i}",{rotation:${-deg}},{rotation:${deg},duration:${r(P.vine)},ease:"sine.inOut",repeat:${reps(L, P.vine)},yoyo:true,svgOrigin:"${v.x} 0"},${r(T + v.phase * 0.3)});`);
  });
  FRONDS.forEach((f, i) => {
    t.push(`tl.fromTo(".${cls}-fr${i}",{rotation:${f.rot - 4}},{rotation:${f.rot + 4},duration:${r(P.frond)},ease:"sine.inOut",repeat:${reps(L, P.frond)},yoyo:true,svgOrigin:"${f.x} ${f.y}"},${r(T + f.phase * 0.4)});`);
  });
  BUTTERFLIES.forEach((b, i) => {
    const k = `${cls}-bf${i}`;
    // x and y on SEPARATE tweens: one tween carrying both forces a single period on two axes and
    // the insect slides along a straight diagonal instead of looping.
    t.push(`tl.fromTo(".${k}-fly",{x:-60},{x:60,duration:${r(P.flutterX)},ease:"sine.inOut",repeat:${reps(L, P.flutterX)},yoyo:true},${r(T + i * 0.8)});`);
    t.push(`tl.fromTo(".${k}-fly",{y:34},{y:-34,duration:${r(P.flutterY)},ease:"sine.inOut",repeat:${reps(L, P.flutterY)},yoyo:true},${r(T + i * 0.5)});`);
    t.push(`tl.fromTo(".${k}-wings",{scaleX:0.5},{scaleX:1,duration:${r(P.wing)},ease:"sine.inOut",repeat:${reps(L, P.wing)},yoyo:true},${r(T)});`);
  });
  return t;
};

// ═══════════════════════════ the cast ═══════════════════════════
// THE THREE ANIMALS. The reference (jungle-film.jsx:67-113) places a toucan, a monkey and a tiger
// across five of its six scenes — Enter and Join carry all three. Every path below is the
// reference's own geometry in the authored 1920x1080 space.
//
// Each animal is an outer positioning group that is never animated, wrapping the inner groups that
// move; the inner groups therefore take their pivots in the animal's LOCAL space (header note).
const MONKEY_FUR = "#7A4A24", TIGER_FUR = "#E7862B", TIGER_STRIPE = "#7A3B12";

// TOUCAN (67-80) — flap = sin(clock*5)*22deg about the wing root, bob = sin(clock*5)*6px on the
// whole bird: one wingbeat drives both.
function toucan(cls, { x, y, s = 1, beak }) {
  return `<g transform="translate(${r(x)} ${r(y)}) scale(${r(s)})"><g class="${cls}-bob">
    <g class="${cls}-wing"><path d="M0 0 Q -50 -30 -96 -6 Q -54 6 0 0 Z" fill="#111"></path></g>
    <ellipse cx="0" cy="6" rx="42" ry="34" fill="#111"></ellipse>
    <circle cx="26" cy="-8" r="22" fill="#111"></circle>
    <circle cx="30" cy="-12" r="7" fill="#fff"></circle><circle cx="32" cy="-12" r="3.5" fill="#111"></circle>
    <path d="M40 -14 Q 104 -18 116 4 Q 96 16 44 8 Z" fill="${beak || "#F4A100"}"></path>
    <path d="M40 -14 Q 104 -18 116 4" stroke="rgba(0,0,0,0.2)" stroke-width="2" fill="none"></path>
    <path d="M-8 34 Q 12 68 34 40" fill="#F4C74A" opacity="0.9"></path>
  </g></g>`;
}
// MONKEY (81-95) — hangs from a vine stub and swings +-16deg about the TOP of that stub, local
// (0, -60); the tail trails on the same beat.
function monkey(cls, { x, y, s = 1, color = MONKEY_FUR }) {
  return `<g transform="translate(${r(x)} ${r(y)}) scale(${r(s)})"><g class="${cls}-sw">
    <path d="M0 -60 Q 10 -20 0 20" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="round"></path>
    <circle cx="0" cy="46" r="30" fill="${color}"></circle>
    <circle cx="0" cy="42" r="20" fill="#E7C9A0"></circle>
    <circle cx="-20" cy="30" r="11" fill="${color}"></circle><circle cx="20" cy="30" r="11" fill="${color}"></circle>
    <circle cx="-8" cy="40" r="3" fill="#3A2A1A"></circle><circle cx="8" cy="40" r="3" fill="#3A2A1A"></circle>
    <path d="M-8 52 Q 0 58 8 52" stroke="#3A2A1A" stroke-width="2.5" fill="none" stroke-linecap="round"></path>
    <ellipse cx="0" cy="88" rx="24" ry="30" fill="${color}"></ellipse>
    <g class="${cls}-tail"><path d="M22 90 Q 70 90 64 40" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"></path></g>
  </g></g>`;
}
// TIGER (96-113) — prowls. The reference lifts alternating legs off `sin(clock*4)` and sways the
// tail on the same beat. `facing:-1` mirrors the group, which is why the mirror lives in the STATIC
// transform and never in a tween — and why the tail's pivot is written unmirrored.
function tiger(cls, { x, y, s = 1, facing = 1, color = TIGER_FUR }) {
  const leg = (n, lx) => `<line class="${cls}-l${n}" x1="${lx}" y1="40" x2="${lx}" y2="70" stroke="${color}" stroke-width="16" stroke-linecap="round"></line>`;
  return `<g transform="translate(${r(x)} ${r(y)}) scale(${r(facing * s)} ${r(s)})"><g class="${cls}-body">
    <ellipse cx="0" cy="0" rx="90" ry="46" fill="${color}"></ellipse>
    ${[-50, -20, 20, 55].map((sx) => `<path d="M${sx} -40 q 0 -18 8 -30" stroke="${TIGER_STRIPE}" stroke-width="9" fill="none" stroke-linecap="round" opacity="0.5"></path>`).join("")}
    ${leg(0, -70)}${leg(1, 60)}${leg(2, -40)}${leg(3, 30)}
    <circle cx="82" cy="-16" r="40" fill="${color}"></circle>
    <path d="M58 -46 l10 22 l-22 -6 Z" fill="${color}"></path><path d="M106 -46 l-10 22 l22 -6 Z" fill="${color}"></path>
    <circle cx="70" cy="-22" r="5" fill="#2A1A0E"></circle><circle cx="96" cy="-22" r="5" fill="#2A1A0E"></circle>
    <path d="M78 -4 q 6 6 12 0" stroke="#2A1A0E" stroke-width="3" fill="none" stroke-linecap="round"></path>
    <g class="${cls}-tl"><path d="M-100 -6 q -40 4 -64 -14" stroke="${color}" stroke-width="14" fill="none" stroke-linecap="round"></path></g>
  </g></g>`;
}

function castHtml(cls, th, list) {
  return (list || []).map((c, i) => {
    const k = `${cls}-c${i}`;
    if (c.kind === "monkey") return monkey(k, c);
    if (c.kind === "tiger") return tiger(k, c);
    return toucan(k, { ...c, beak: th.accent });
  }).join("");
}

function castTweens(ctx, cls, list) {
  const L = Math.max(0.4, ctx.L), T = ctx.T, out = [];
  (list || []).forEach((c, i) => {
    const k = `${cls}-c${i}`;
    const ph = (c.phase || 0) * 0.2;
    if (c.kind === "monkey") {
      out.push(`tl.fromTo(".${k}-sw",{rotation:-16},{rotation:16,duration:${r(P.monkey)},ease:"sine.inOut",repeat:${reps(L, P.monkey)},yoyo:true,svgOrigin:"0 -60"},${r(T + ph)});`);
      out.push(`tl.fromTo(".${k}-tail",{rotation:-8},{rotation:8,duration:${r(P.monkey)},ease:"sine.inOut",repeat:${reps(L, P.monkey)},yoyo:true,svgOrigin:"22 90"},${r(T + ph)});`);
    } else if (c.kind === "tiger") {
      // Alternating gait: legs 0/3 lift while 1/2 plant, then swap. The alternation offset is a
      // QUARTER of the gait period; the yoyo's own duration is a HALF of it. Using the quarter for
      // both (the bug this replaces) trotted the tiger at double speed while its tail — correctly
      // on the half — swung at the reference rate, so the two were visibly out of step.
      [0, 1, 2, 3].forEach((n) => {
        const off = n % 2 === 0 ? 0 : r(P.tiger / 2);
        out.push(`tl.fromTo(".${k}-l${n}",{scaleY:1},{scaleY:0.82,duration:${r(P.tiger)},ease:"sine.inOut",repeat:${reps(L - off, P.tiger)},yoyo:true,transformOrigin:"50% 0%"},${r(T + ph + off)});`);
      });
      out.push(`tl.fromTo(".${k}-tl",{rotation:-7},{rotation:7,duration:${r(P.tiger)},ease:"sine.inOut",repeat:${reps(L, P.tiger)},yoyo:true,svgOrigin:"-100 -6"},${r(T + ph)});`);
    } else {
      // Toucan: one wingbeat drives both the wing and the body lift. -42..2 already carries the
      // reference's -20deg rest angle (`rotate(-20 + flap)`, flap +-22), and the wing pivots about
      // its root — local (0,0), the point the wing path is drawn from, NOT the bird's stage
      // coordinate. Passing the stage coordinate threw the wing ~1100 local units off the bird.
      out.push(`tl.fromTo(".${k}-wing",{rotation:-42},{rotation:2,duration:${r(P.toucan)},ease:"sine.inOut",repeat:${reps(L, P.toucan)},yoyo:true,svgOrigin:"0 0"},${r(T + ph)});`);
      out.push(`tl.fromTo(".${k}-bob",{y:-6},{y:6,duration:${r(P.toucan)},ease:"sine.inOut",repeat:${reps(L, P.toucan)},yoyo:true},${r(T + ph)});`);
    }
  });
  return out;
}

module.exports = { jungleBg, jungleTweens, castHtml, castTweens, toucan, monkey, tiger, butterfly };
