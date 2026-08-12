// FETCH FURNITURE — the park AND its cast, drawn the way the reference draws them: one flat SVG
// illustration, no blur anywhere.
//
// WHY THIS EXISTS. Our fetch painted its world in CSS — a gradient sky, a radial-gradient blob for
// the sun, a blurred gradient layer for clouds, two green bands with a scalloped top. Side by side
// with `framecheck/ref/Fetch` that reads as a pale backdrop; the reference reads as a PLACE: rolling
// hills in three greens, a picket fence running the width of the frame, grass tufts along the
// ground, trees and bushes, and a sun with twelve turning rays. Nothing in this pack is blurred —
// it is a flat vector illustration, and a soft-edged blob is the wrong material for it.
//
// GEOMETRY IS THE REFERENCE'S, VERBATIM. Every coordinate below is the reference's own 1920x1080
// space (`GROUND_Y = 748`, Fetch/src/fetch-film.jsx:43), so the whole set is emitted as one SVG
// with that viewBox and needs no unit conversion. Tween values on these elements are therefore in
// SVG USER UNITS, not cqw — the pack's cqw rule applies to the DOM type layer, which is the only
// layer that has to reflow.
//
// THE CAST LIVES HERE TOO — dog, master, ball, hearts, sparkles, dust, paw prints, the paw glyph.
// It is passed into `park()`'s third argument so the world and the animals share ONE transform,
// exactly as the reference's `<Scene>` wraps `<Park>` and its cast together (fetch-film.jsx:369-376).

const GROUND_Y = 748;
const W = 1920, H = 1080;

// Set dressing colours. These are the reference's literals, not brand-derived: recolouring a
// picket fence or a tree trunk from the accent is how an illustrated world stops looking illustrated.
const HILL_A = "#A9D57F", HILL_B = "#9ECB72";
const TRUNK = "#9B6B3F", LEAF_A = "#6FA84A", LEAF_B = "#79B255", LEAF_C = "#83BC5F";
const RAIL = "#EFE6D2", POST = "#F7EFDD";
const SKIN = "#E8B98E", HAIR = "#5A4632", JEAN_A = "#3F4A5A", JEAN_B = "#4A576A";
// A heart is pink because a heart is pink — a world-semantic colour, never brand-derived.
// The reference tints the middle heart of the three with it (fetch-film.jsx:276).
const HEART = "#F2668A";

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

// Two rails and `posts` uprights. The reference runs the fence from x=-40 at a 70px gap; the post
// COUNT here is the reference's 34 plus four, because the Run beat now drags the fence 630px left
// (see `parkTweens`) and a 34-post fence would end in mid-air 256px short of the right edge.
// Those four extra posts are off-frame on every other beat, so nothing else changes.
const FENCE_POSTS = 38, FENCE_GAP = 70;
const fence = (x, y, posts = FENCE_POSTS, gap = FENCE_GAP) => `<g transform="translate(${x} ${y})">
    <rect x="0" y="-46" width="${gap * (posts - 1) + 24}" height="12" rx="6" fill="${RAIL}"/>
    <rect x="0" y="-22" width="${gap * (posts - 1) + 24}" height="12" rx="6" fill="${RAIL}"/>
    ${Array.from({ length: posts }, (_, i) => `<rect x="${i * gap}" y="-64" width="16" height="72" rx="6" fill="${POST}"/>`).join("")}
  </g>`;

// A tuft is three blades. The reference sways them by moving each blade's Q control point AND its
// tip by `sin(clock*2 + i) * 4` (fetch-film.jsx:130); we rotate the whole tuft about its base
// instead — the same read, and a `d` attribute is not a thing a paused timeline can interpolate
// cheaply. The ANGLE is solved back from that 4px displacement, see TUFT_SWAY below.
const tuft = (id, i, x, y, color = LEAF_A) => `<g class="${id}-tuft${i % 4}" transform="translate(${x} ${y})" stroke="${color}" stroke-width="5" stroke-linecap="round" fill="none">
    <path d="M0 0 Q -6 -18 -10 -30"/><path d="M8 0 Q 8 -20 10 -34"/><path d="M-8 0 Q -10 -16 -16 -26"/>
  </g>`;

// 4px of tip travel on a blade whose tip sits ~30px above its base is atan(4/30) = 7.6 degrees.
// The first port used 2.4 degrees, which is 1.3px of travel — under a third of the reference's,
// and at that size the whole field reads as still.
const TUFT_SWAY = 7.6;
const TUFT_COUNT = 20, TUFT_GAP = 150, TUFT_X0 = 40;

// ---- the park ----------------------------------------------------------------
// Layer order is the reference's: sky, sun, clouds, hills, ground, trees/bushes, fence, tufts.
// Each parallax layer is its own classed group with no transform of its own, so `parkTweens` can
// translate it without fighting a baked one (GSAP replaces the whole `transform` property).
function park(id, th, extra = "") {
  const clouds = [{ x: 620, y: 180, s: 1, o: 0.95 }, { x: 1300, y: 130, s: 1.3, o: 0.9 }, { x: 1720, y: 250, s: 0.8, o: 0.85 }];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;display:block;">
    ${sky(id, th)}
    ${sun(id, th)}
    <g class="${id}-clouds">${clouds.map((c) => cloud(c.x, c.y, c.s, c.o)).join("")}</g>
    <g class="${id}-hills">
      ${hill(300, GROUND_Y, 620, 230, HILL_A)}
      ${hill(1100, GROUND_Y, 720, 300, HILL_B)}
      ${hill(1800, GROUND_Y, 560, 210, HILL_A)}
    </g>
    ${ground(th)}
    <g class="${id}-scenery" opacity="0.96">
      ${tree(120, GROUND_Y + 6, 1.05)}
      ${tree(1780, GROUND_Y + 10, 1.15)}
      ${bush(640, GROUND_Y + 14, 1)}
      ${bush(1420, GROUND_Y + 16, 1.1)}
    </g>
    <g class="${id}-fence">${fence(-40, GROUND_Y + 30)}</g>
    <g class="${id}-tufts">${Array.from({ length: TUFT_COUNT }, (_, i) => tuft(id, i, TUFT_X0 + i * TUFT_GAP, GROUND_Y + 120)).join("")}</g>
    ${extra}
  </svg>`;
}

// The sun turns at 8 deg/s (45s a revolution) and the tufts sway on a PI-second cycle. Tufts are
// bucketed into four phase groups so twenty of them cost four tweens, not twenty.
//
// `drift` is the RUN beat's parallax, and it is the only camera move in the film that is not the
// per-beat push. The reference sets `drift = run * 900` and threads it through the whole set at
// five different rates (fetch-film.jsx:393, 146-162): clouds 0.3x, hills 0.25x, trees/bushes 0.5x,
// fence 0.7x, tufts 1.0x. The dog runs on the spot relative to a world that tracks past it — drop
// the drift and the dog crosses a completely static park, which is what the first port did.
//
// The reference wraps the fence and the tuft field with a modulo so they scroll forever; here the
// layers are simply drawn wide enough to cover the whole travel (see FENCE_POSTS / TUFT_COUNT), so
// the motion is one smooth tween on the reference's own easeInOutSine velocity instead of a
// sawtooth that pops.
const PARALLAX = { clouds: 0.3, hills: 0.25, scenery: 0.5, fence: 0.7, tufts: 1.0 };
function parkTweens(id, ctx, K, { drift = 0, from = 0, dur = 0 } = {}) {
  const L = ctx.L, T = ctx.T;
  const out = [
    `tl.to(".${id}-rays",{rotation:360,duration:45,ease:"none",repeat:${K.reps(L, 45)}},${K.r(T)});`,
  ];
  for (let g = 0; g < 4; g++) {
    // Each bucket leans the other way from its neighbour, so the field does not sway as one blade.
    const dir = g % 2 ? -1 : 1;
    out.push(`tl.fromTo(".${id}-tuft${g}",{rotation:${n(-TUFT_SWAY * dir)}},{rotation:${n(TUFT_SWAY * dir)},duration:${K.r(Math.PI / 2)},ease:"sine.inOut",repeat:${K.reps(L, Math.PI / 2)},yoyo:true,transformOrigin:"50% 100%"},${K.r(T + g * 0.18)});`);
  }
  if (drift > 0) {
    const t0 = K.r(T + from), D = K.r(Math.max(0.2, dur));
    for (const [layer, rate] of Object.entries(PARALLAX)) {
      out.push(`tl.fromTo(".${id}-${layer}",{x:0},{x:${n(-drift * rate)},duration:${D},ease:"sine.inOut"},${t0});`);
    }
  } else {
    // No run this beat: the clouds still drift, slowly, so the sky is never a still.
    out.push(`tl.to(".${id}-clouds",{x:-70,duration:${K.r(Math.max(6, L * 2))},ease:"none"},${K.r(T)});`);
  }
  return out;
}

// ---- the dog -----------------------------------------------------------------
// A dog running a ball across the pasture to someone waiting for it. This is the pack — the reason
// it is called fetch — and the first port drew it on ONE beat of six.
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
//
// `running` gates the speed streaks and the dust puffs, because the reference only draws them
// behind a moving dog (`{running && <Dust .../>}`, fetch-film.jsx:373; MotionLines only in Run).
// Drawing them behind a sitting dog would be furniture with nothing to explain it — and emitting
// their tweens without the markup is a dead tween, which is the same defect from the other side.
function dog(id, th, { x, y, scale = 1.62, carrying = true, running = true, lines = false } = {}) {
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
      ${carrying ? `<g class="${id}-carry" transform="translate(96 -78)"><circle r="15" fill="${th.accent}"/>
        <path d="M-13 -6 Q 0 4 13 -6" stroke="#fff" stroke-width="2.5" fill="none" opacity="0.8"/>
        <circle cx="-5" cy="-6" r="4" fill="#fff" opacity="0.4"/></g>` : ""}
    </g>
    ${legOf(`${id}-legnb`, HIP_B, th.dog)}
    ${legOf(`${id}-legnf`, HIP_F, th.dog)}
  </g>
  ${lines ? `<g transform="translate(-96 -70)" stroke="${th.ink}" stroke-opacity="0.28" stroke-width="4" stroke-linecap="round">
    ${Array.from({ length: 4 }, (_, i) => `<line x1="0" y1="${-30 + i * 20}" x2="${-40 - i * 22}" y2="${-30 + i * 20}"/>`).join("")}
  </g>` : ""}
  ${running ? `<g transform="translate(-66 6)">${Array.from({ length: 3 }, (_, i) => `<circle class="${id}-dust${i}" r="16" fill="#fff" opacity="0"/>`).join("")}</g>` : ""}
  </g></g>`;
}

// The dog's own motion. Two modes, because the reference has two:
//
//   RUNNING  — the four-leg cycle, the body bob, the fast tail and ear, the dust. `runFor` is how
//              many seconds of the beat the dog is actually running; Title runs for the first half
//              and then sits (`running = progress < 0.5`, fetch-film.jsx:364), so the cycle is cut
//              short and the legs settle straight rather than freezing mid-stride.
//   IDLE     — no gait at all; the tail wags on `sin(phase*0.6) * 22 * wag` and the ear on
//              `-14 - sin(phase*0.6)*6`, where `phase = localTime * idleK`. That is why the CTA dog
//              (idleK 2.4, wag 3) wags nearly twice as hard as the Feature dog (1.6 / 1.6).
//
// Tween values are SVG user units — these elements live inside the reference's 1920x1080 viewBox.
function dogTweens(id, ctx, K, {
  spanX = 0, travelAt = 0, travelDur = 0, travelEase = "sine.inOut",
  runFor = 0, idleK = 0, wag = 1, dropAt = null,
} = {}) {
  const T = ctx.T, L = ctx.L;
  const out = [];
  if (spanX) {
    out.push(`tl.to(".${id}-dogx",{x:${n(spanX)},duration:${K.r(Math.max(0.1, travelDur || L))},ease:"${travelEase}"},${K.r(T + travelAt)});`);
  }

  if (runFor > 0) {
    const half = STRIDE / 2;
    const cyc = (cls, a0, a1, hx, off = 0) =>
      `tl.fromTo(".${id}-${cls}",{rotation:${K.r(a0)}},{rotation:${K.r(a1)},duration:${K.r(half)},ease:"sine.inOut",repeat:${K.reps(runFor, half)},yoyo:true,svgOrigin:"${hx} ${HIP_Y}"},${K.r(T + off)});`;
    out.push(
      cyc("legnb", -LEG_A, LEG_A, HIP_B),
      cyc("legnf", LEG_A, -LEG_A, HIP_F),
      cyc("legfb", -LEG_A, LEG_A, HIP_B, 0.306),
      cyc("legff", LEG_A, -LEG_A, HIP_F, 0.306),
      // The body bounces once per half-stride: the reference's bob is -|sin(phase)|, never positive.
      `tl.fromTo(".${id}-dogbob",{y:0},{y:-7,duration:${K.r(STRIDE / 4)},ease:"sine.inOut",repeat:${K.reps(runFor, STRIDE / 4)},yoyo:true},${K.r(T)});`,
      // Running tail: sin(phase*1.5)*16 — period 2*PI/(8.5*1.5) = 0.493s.
      `tl.fromTo(".${id}-tail",{rotation:-16},{rotation:16,duration:${K.r(0.493 / 2)},ease:"sine.inOut",repeat:${K.reps(runFor, 0.493 / 2)},yoyo:true,svgOrigin:"0 0"},${K.r(T)});`,
      // Running ear: -20 - sin(phase)*16, i.e. -4 .. -36 over the stride.
      `tl.fromTo(".${id}-ear",{rotation:-4},{rotation:-36,duration:${K.r(half)},ease:"sine.inOut",repeat:${K.reps(runFor, half)},yoyo:true,svgOrigin:"0 0"},${K.r(T)});`,
      // Dust: each puff drifts back and up, swells 0.3 -> 1.4 and fades out, a third of a cycle apart.
      ...[0, 1, 2].map((i) => `tl.fromTo(".${id}-dust${i}",{x:0,y:0,scale:0.3,opacity:0.5},{x:-90,y:-20,scale:1.4,opacity:0,duration:${K.r(STRIDE)},ease:"none",repeat:${K.reps(runFor, STRIDE)}},${K.r(T + i * (STRIDE / 3))});`),
    );
    // The dog stops before the beat does (Title): straighten the legs and settle the body rather
    // than leaving a stride frozen at whatever angle the last repeat happened to end on.
    if (runFor < L - 0.2) {
      const stop = K.r(T + runFor);
      for (const cls of ["legnb", "legnf", "legfb", "legff"]) {
        out.push(`tl.to(".${id}-${cls}",{rotation:0,duration:0.16,ease:"power2.out",svgOrigin:"${cls.endsWith("b") ? HIP_B : HIP_F} ${HIP_Y}"},${stop});`);
      }
      out.push(`tl.to(".${id}-dogbob",{y:0,duration:0.16,ease:"power2.out"},${stop});`);
    }
  }

  if (idleK > 0) {
    // sin(phase*0.6) where phase = localTime*idleK: angular frequency 0.6*idleK, so a yoyo half
    // period is PI/(0.6*idleK). Amplitude is the reference's 22 degrees times the beat's `wag`.
    const halfP = Math.PI / (0.6 * idleK);
    const amp = 22 * wag;
    const at = K.r(T + (runFor > 0 ? runFor : 0));
    const span = Math.max(0.3, L - (runFor > 0 ? runFor : 0));
    out.push(
      `tl.fromTo(".${id}-tail",{rotation:${n(-amp)}},{rotation:${n(amp)},duration:${K.r(halfP)},ease:"sine.inOut",repeat:${K.reps(span, halfP)},yoyo:true,svgOrigin:"0 0"},${at});`,
      // Idle ear: -14 - sin(phase*0.6)*6, i.e. -8 .. -20 on the same period.
      `tl.fromTo(".${id}-ear",{rotation:-8},{rotation:-20,duration:${K.r(halfP)},ease:"sine.inOut",repeat:${K.reps(span, halfP)},yoyo:true,svgOrigin:"0 0"},${at});`,
    );
  }

  // The moment the ball leaves the mouth. The reference simply stops rendering the carried ball at
  // progress 0.4 and starts rendering the free one (fetch-film.jsx:419, 432).
  if (dropAt != null) out.push(`tl.set(".${id}-carry",{opacity:0},${K.r(T + dropAt)});`);
  return out;
}

// ---- the master --------------------------------------------------------------
// Someone waiting with open arms, mirrored so they face the incoming dog.
//
// BOTH ARMS ARE TWEENABLE. The reference's `armLift` opens the figure up to receive the ball —
// 0 -> 12 degrees across Run's last third, 0 -> 26 across Fetch's middle (fetch-film.jsx:400, 423)
// — and it moves the reaching arm and the waving arm in opposite directions. The first port baked
// `rotate(-30)` straight onto the reaching arm with no class, so the lift could not be animated at
// all. Each arm now nests: a static group carries the reference's REST angle, a `-lift` group
// carries the lift, and (on the front arm) a `-wave` group carries the oscillation.
function master(id, th, { x, y, scale = 1.12 } = {}) {
  return `<g transform="translate(${x} ${y}) scale(${-scale} ${scale})">
    <rect x="-26" y="-96" width="22" height="98" rx="11" fill="${JEAN_A}"/>
    <rect x="6" y="-96" width="22" height="98" rx="11" fill="${JEAN_B}"/>
    <rect x="-34" y="-186" width="70" height="104" rx="30" fill="${th.accent}"/>
    <g transform="translate(30 -170)"><g class="${id}-blift"><g transform="rotate(-30)">
      <rect x="0" y="-9" width="78" height="20" rx="10" fill="${th.accent}"/><circle cx="80" cy="0" r="12" fill="${SKIN}"/>
    </g></g></g>
    <circle cx="2" cy="-214" r="30" fill="${SKIN}"/>
    <path d="M-26 -226 Q 2 -256 30 -224 Q 20 -240 2 -242 Q -14 -242 -26 -226 Z" fill="${HAIR}"/>
    <circle cx="-8" cy="-214" r="3.5" fill="${th.ink}"/>
    <path d="M-14 -202 Q -4 -196 6 -202" stroke="${th.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <g transform="translate(-30 -170)"><g class="${id}-flift"><g transform="rotate(34)"><g class="${id}-wave">
      <rect x="-78" y="-9" width="80" height="20" rx="10" fill="${th.accent}"/><circle cx="-80" cy="0" r="12" fill="${SKIN}"/>
    </g></g></g></g>
  </g>`;
}
// The waving arm sits at the reference's 34 degrees (baked above) and swings +/-22 on
// `sin(localTime * waveK)`: a half period of PI/waveK — 0.785s at waveK 4 (Title), 0.628s at 5
// (Run), 0.524s at 6 (Fetch). `lift` ramps both arms over `[liftFrom, liftTo]` of the beat.
function masterTweens(id, ctx, K, {
  waveK = 5, waveAt = 0, lift = 0, liftFrom = 0.6, liftTo = 0.95, liftEase = "power2.out",
} = {}) {
  const T = ctx.T, L = ctx.L;
  const halfP = Math.PI / waveK;
  const start = K.r(T + waveAt * L);
  const span = Math.max(0.3, L * (1 - waveAt));
  const out = [
    `tl.fromTo(".${id}-wave",{rotation:-22},{rotation:22,duration:${K.r(halfP)},ease:"sine.inOut",repeat:${K.reps(span, halfP)},yoyo:true,svgOrigin:"0 0"},${start});`,
  ];
  if (lift > 0) {
    const at = K.r(T + liftFrom * L), dur = K.r(Math.max(0.15, (liftTo - liftFrom) * L));
    out.push(
      `tl.fromTo(".${id}-blift",{rotation:0},{rotation:${n(-lift)},duration:${dur},ease:"${liftEase}",svgOrigin:"0 0"},${at});`,
      `tl.fromTo(".${id}-flift",{rotation:0},{rotation:${n(lift)},duration:${dur},ease:"${liftEase}",svgOrigin:"0 0"},${at});`,
    );
  }
  return out;
}

// ---- the ball ----------------------------------------------------------------
// FLAT VECTOR, both times it appears. The reference's Ball is an accent disc with two 3px white
// seam arcs and a soft white highlight at 0.28r (fetch-film.jsx:238-247) — no gradient, no blur.
// The first port invented a radial-gradient sphere with an 18px-blurred drop shadow and flew it
// across five of six beats, on a pack whose whole rule is that nothing is blurred.
function ball(id, th, { cls, x, y, r = 20, hidden = false } = {}) {
  return `<g transform="translate(${x} ${y})"><g class="${cls}"${hidden ? ` opacity="0"` : ""}>
    <circle r="${r}" fill="${th.accent}"/>
    <path d="M${-r} ${n(-r * 0.3)} Q 0 ${n(r * 0.4)} ${r} ${n(-r * 0.3)}" stroke="#fff" stroke-width="3" fill="none" opacity="0.85"/>
    <path d="M${-r} ${n(r * 0.3)} Q 0 ${n(-r * 0.4)} ${r} ${n(r * 0.3)}" stroke="#fff" stroke-width="3" fill="none" opacity="0.85"/>
    <circle cx="${n(-r * 0.35)}" cy="${n(-r * 0.35)}" r="${n(r * 0.28)}" fill="#fff" opacity="0.35"/>
  </g></g>`;
}

// FETCH: the hand-off. The ball leaves the mouth at progress 0.38, arcs 820 -> 1060 on easeOutCubic
// through progress 0.7, rises 120px and comes back down on `sin(ballDrop*PI)` through 0.62, and
// spins 420 degrees on the way (fetch-film.jsx:420-422, 432).
function ballArcTweens(id, ctx, K, { cls, from = 0.38, dx = 240, rise = 120 } = {}) {
  const T = ctx.T, L = ctx.L;
  const t0 = K.r(T + from * L);
  const flight = K.r(0.32 * L);     // 0.38 -> 0.70
  const arcHalf = K.r(0.12 * L);    // 0.38 -> 0.62, up then down
  return [
    `tl.set(".${id}-${cls}",{opacity:1},${t0});`,
    `tl.to(".${id}-${cls}",{x:${n(dx)},duration:${flight},ease:"power2.out"},${t0});`,
    `tl.to(".${id}-${cls}",{y:${n(-rise)},duration:${arcHalf},ease:"sine.out"},${t0});`,
    `tl.to(".${id}-${cls}",{y:0,duration:${arcHalf},ease:"sine.in"},${K.r(T + (from + 0.12) * L)});`,
    `tl.to(".${id}-${cls}",{rotation:420,duration:${K.r(0.24 * L)},ease:"none"},${t0});`,
  ];
}

// STATS: the hero bounce. `|sin(localTime*3)|` over 220px is a 1.047s period, so a yoyo half is
// 0.524s; `sine.out` up and its mirror down IS the absolute-sine corner at the ground. The shadow
// squashes with it — rx 44 -> 28 in the reference, expressed here as scaleX so the guard's
// layout-property rule is honoured and the ellipse never re-lays-out.
const BOUNCE_HALF = Math.PI / 3 / 2;   // 0.524s
function ballBounce(id, th, { x = 1560, y = GROUND_Y - 40, r = 30 } = {}) {
  return `<g>
    <ellipse class="${id}-bshadow" cx="${x}" cy="${GROUND_Y + 6}" rx="44" ry="10" fill="${th.ink}" opacity="0.125" style="transform-box:fill-box;transform-origin:center;"/>
    ${ball(id, th, { cls: `${id}-bounce`, x, y, r })}
  </g>`;
}
function ballBounceTweens(id, ctx, K, { rise = 220 } = {}) {
  const T = ctx.T, L = ctx.L;
  return [
    `tl.to(".${id}-bounce",{y:${n(-rise)},duration:${K.r(BOUNCE_HALF)},ease:"sine.out",repeat:${K.reps(L, BOUNCE_HALF)},yoyo:true},${K.r(T)});`,
    `tl.to(".${id}-bounce",{rotation:${n(260 * L)},duration:${K.r(L)},ease:"none"},${K.r(T)});`,
    // 28/44 = 0.636: the print the ball leaves shrinks as it lifts, on the same curve.
    `tl.to(".${id}-bshadow",{scaleX:0.636,duration:${K.r(BOUNCE_HALF)},ease:"sine.out",repeat:${K.reps(L, BOUNCE_HALF)},yoyo:true},${K.r(T)});`,
  ];
}

// ---- vector FX ---------------------------------------------------------------
// Paw prints left along the run, appearing as the dog passes them. The fill is the reference's
// `rgba(ink, 0.5)` — the same warm near-black as the type, at half strength, so they read as
// impressions pressed into the ground. The first port invented an olive green, which on green
// grass reads as a mown pattern rather than as paw marks.
function pawTrail(id, th, { from, to, y = GROUND_Y + 96, count = 7 } = {}) {
  const step = (to - from) / Math.max(1, count - 1);
  return `<g fill="${th.ink}" fill-opacity="0.5">${Array.from({ length: count }, (_, i) => {
    const px = from + i * step, dy = i % 2 ? 0 : 14;
    return `<g class="${id}-paw" transform="translate(${n(px)} ${y + dy})" opacity="0">
      <ellipse cx="0" cy="0" rx="9" ry="11"/><circle cx="-8" cy="-10" r="3.5"/><circle cx="0" cy="-13" r="3.5"/><circle cx="8" cy="-10" r="3.5"/></g>`;
  }).join("")}</g>`;
}
// Print i is revealed at progress `0.1 + (i/(n-1)) * 0.5` over 0.06 — the reference's `M.draw`
// window (fetch-film.jsx:266), so the trail lays itself down under the dog rather than all at once.
const pawTweens = (id, ctx, K, { at = 0.1, count = 7 } = {}) => [
  `tl.fromTo(".${id}-paw",{opacity:0},{opacity:0.5,duration:${K.r(Math.max(0.06, 0.06 * ctx.L))},ease:"none",stagger:${K.r((0.5 * ctx.L) / Math.max(1, count - 1))}},${K.r(ctx.T + at * ctx.L)});`,
];

// Three hearts float up out of the delivery. The middle one is pink, the outer two accent.
function hearts(id, th, { cx = 1160, cy = GROUND_Y - 220 } = {}) {
  const at = [[-70, -10], [10, -40], [80, 0]];
  return `<g>${at.map((h, i) => `<g transform="translate(${cx + h[0]} ${cy + h[1]})"><g class="${id}-hrt${i}" opacity="0">
    <path d="M0 6 C -16 -12 -34 2 0 26 C 34 2 16 -12 0 6 Z" fill="${i === 1 ? HEART : th.accent}"/>
  </g></g>`).join("")}</g>`;
}
// Each heart rises 150px over 0.6 of the beat on easeOutCubic, 0.12 apart, scaling 0.6 -> 1.4 with
// a `sin(t*PI)` opacity arc — in from nothing, out to nothing (fetch-film.jsx:272-278). The arc is
// authored as two sequential opacity tweens because a paused timeline has no per-frame hook.
function heartTweens(id, ctx, K, { at = 0.6 } = {}) {
  const T = ctx.T, L = ctx.L;
  const out = [];
  for (let i = 0; i < 3; i++) {
    const t0 = K.r(T + (at + i * 0.12) * L), D = 0.6 * L;
    out.push(
      `tl.fromTo(".${id}-hrt${i}",{y:0,scale:0.6,opacity:0},{y:-150,scale:1.4,duration:${K.r(D)},ease:"power2.out"},${t0});`,
      `tl.to(".${id}-hrt${i}",{opacity:1,duration:${K.r(D * 0.3)},ease:"none"},${t0});`,
      `tl.to(".${id}-hrt${i}",{opacity:0,duration:${K.r(D * 0.7)},ease:"none"},${K.r(t0 + D * 0.3)});`,
    );
  }
  return out;
}

// A four-point sun-yellow star that twinkles on `sin(clock*4 + x)`: scale 0.7-1.2 and opacity
// 0.5-1.0 on a 1.571s period (fetch-film.jsx:280-283). Both properties ride ONE tween, because two
// tweens on the same element over the same window is exactly the seek hazard the lint flags.
const SPARKLE_HALF = Math.PI / 4;   // 0.785s
function sparkle(id, th, { i, x, y, s = 1 }) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><g class="${id}-spk${i}">
    <path d="M0 -12 L3 -3 12 0 3 3 0 12 -3 3 -12 0 -3 -3 Z" fill="${th.sun}"/>
  </g></g>`;
}
const sparkleTweens = (id, ctx, K, { count = 1 } = {}) =>
  Array.from({ length: count }, (_, i) =>
    `tl.fromTo(".${id}-spk${i}",{scale:0.7,opacity:0.5},{scale:1.2,opacity:1,duration:${K.r(SPARKLE_HALF)},ease:"sine.inOut",repeat:${K.reps(ctx.L, SPARKLE_HALF)},yoyo:true},${K.r(ctx.T + i * 0.31)});`);

// THE PACK'S MARK. The reference draws it in the BrandTag badge and again inside the CTA button
// (fetch-film.jsx:313-315, 321, 517); the first port drew it nowhere. `size` is a CSS length,
// because both of its homes are DOM, not SVG.
const pawGlyph = (size, color) => `<svg viewBox="-16 -16 32 32" style="width:${size};height:${size};display:block;flex:0 0 auto;" aria-hidden="true"><g fill="${color}"><ellipse cx="0" cy="4" rx="9" ry="10"/><circle cx="-9" cy="-6" r="4"/><circle cx="-2" cy="-11" r="4"/><circle cx="6" cy="-9" r="4"/><circle cx="11" cy="-1" r="3.5"/></g></svg>`;

module.exports = {
  GROUND_Y, W, H,
  park, parkTweens, sun, cloud, hill, tree, bush, fence, tuft, ground,
  dog, dogTweens, master, masterTweens,
  ball, ballArcTweens, ballBounce, ballBounceTweens,
  pawTrail, pawTweens, hearts, heartTweens, sparkle, sparkleTweens, pawGlyph,
  SKIN, HAIR, JEAN_A, JEAN_B,
};
