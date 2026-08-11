// FIGHT FURNITURE — the arena, the cast, the camera and the chrome from the Claude Design
// reference.
//
// Reference: old-templete/all-template-handoffs/Fight/src/fight-film.jsx. Every coordinate,
// radius, stroke and period below is the reference's own, in its authored 1920x1080 space.
//
// WHY THIS FILE EXISTS. The port kept the ARENA (halftone, spotlight, ropes) and dropped the
// STRIKE furniture — the impact burst, the speed lines, the struck flash, the continuous shake
// and the skew vocabulary — so the film read as a sequence of arrivals rather than as blows.
// The impact burst is the pack's own thumbnail glyph (Fight.dc.html:36) and the word "Impact"
// did not appear anywhere in the composer. That is five of the reference's six signature
// devices, which is why the pack scored 52/100 — the worst in the library.
//
// SEEK-SAFETY. The reference is React re-evaluated every frame and reads `Math.sin(clock*k)`
// straight into a style. HyperFrames seeks ONE paused GSAP timeline, so every continuous motion
// here is a repeating yoyo tracing the same curve: `sine.inOut` + `yoyo` IS a sine wave, so an
// amplitude A over a period P is authored as a yoyo of 2A over P/2. Amplitude and period are the
// reference's; only the authoring differs.
//
// LAYER OWNERSHIP. om_port_kit's shell gives a composer three layers it does not own
// (`.om-cam` = the cut, `.om-bg`/`.om-drift` = the ambient parallax). The reference's Frame owns
// a camera of its own — a punch-in, a permanent shake and a struck flash — so this file builds
// that camera as NESTED WRAPPERS INSIDE the content layer, one property per wrapper, layered
// additively on top of whatever cut transition_kit deals. Nothing here contends for a property
// the kit already animates.

const { r, esc, hexToRgb } = require("./composer_kit");

const rgba = (h, a) => { const [R, G, B] = hexToRgb(h); return `rgba(${R},${G},${B},${a})`; };
const reps = (span, dur) => Math.max(0, Math.floor(span / Math.max(0.001, dur)) - 1);
// The reference's authored stage. Same conversion as om_port_kit.stageOf(1920, 1080), kept local
// so a furniture helper can be called with nothing but a theme.
const U = (px) => Math.round((px / 1920) * 10000) / 100;

// ═══════════════════════════ the arena ═══════════════════════════

// HALFTONE (fight-film.jsx:37-40) — a 2px dot on a 40px tile, drifting at 8px/s across and
// 5px/s down. The reference animates `backgroundPosition`; a background-position tween is a
// LAYOUT-ish paint the motion-safety guard rightly dislikes and the two axes run at different
// rates, so the drift is carried by two NESTED transform wrappers instead — one 40px tile per
// period on `ease:"none"`, which loops seamlessly because a tile shift is invisible.
//
// The per-scene opacity is the reference's own (MainEvent 0.4, Challenger 0.5, Champion 0.3,
// Combos 0.35, Scorecard 0.3, StepInRing 0.35). Our port hardcoded 0.5 everywhere, which cost
// the film the reference's alternation between lit beats and flat-ground beats.
function halftone(id, th, o) {
  const dot = `radial-gradient(${rgba(th.ink, 0.06)} 2px, transparent 2px)`;
  return `<div class="${id}-htx" style="position:absolute;inset:${r(-U(80))}cqw;pointer-events:none;">
    <div class="${id}-hty" style="position:absolute;inset:0;background-image:${dot};background-size:${r(U(40))}cqw ${r(U(40))}cqw;opacity:${r(o)};"></div>
  </div>`;
}

// SPOTLIGHT CONE (41-49) — narrow at the ceiling, wide at the floor, screen-blended gold. Only
// the TWO TOP POINTS carry the sway (`960+sway,-40  1240+sway,-40`), so the cone PIVOTS about
// its floor edge like a lamp on a rig; the pool on the canvas stays put while the beam angle
// changes. Our port translated the whole <g>, which slid the pool with the beam.
//
// A shear, not a rotation. Rotating about (960,1120) would swing the floor points through
// ±78px of vertical travel, which the reference's fixed floor edge does not do. skewX about
// `svgOrigin:"960 1120"` displaces x by exactly (y-1120)*tan(a) — zero at the floor, maximal at
// the ceiling — which IS the reference's transform. tan(a) = 120/1160 gives a = 5.9deg for the
// authored ±120px top-edge sway.
const CONE_SKEW = 5.9;
function spotlight(id, th) {
  return `<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">
    <defs><radialGradient id="${id}spot" cx="0.5" cy="0.1" r="0.9">
      <stop offset="0" stop-color="${rgba(th.gold, 0.22)}"/><stop offset="0.5" stop-color="${rgba(th.gold, 0.05)}"/><stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </radialGradient></defs>
    <g class="${id}-cone" style="mix-blend-mode:screen;">
      <polygon points="960,-40 1240,-40 1720,1120 200,1120" fill="url(#${id}spot)"></polygon>
    </g>
  </svg>`;
}

// RING ROPES (50-52) — three DOUBLE-stroked full-width lines at y=936/980/1024 (44px apart), a
// 6px ink@0.5 stroke with a 2px accent stroke laid over the same axis, plus two 20x160 corner
// posts at x=120 and x=1800 rising from y=920. Drawn in the reference's own viewBox rather than
// converted to bottom-anchored offsets — the conversion is what put our ropes 52px apart and
// 18-30px too high.
function ropes(th) {
  const lines = [0, 1, 2].map((i) => {
    const y = 936 + i * 44;
    return `<line x1="0" y1="${y}" x2="1920" y2="${y}" stroke="${rgba(th.ink, 0.5)}" stroke-width="6"></line>
      <line x1="0" y1="${y}" x2="1920" y2="${y}" stroke="${th.accent}" stroke-width="2"></line>`;
  }).join("");
  const posts = [120, 1800].map((x) => `<rect x="${x - 10}" y="920" width="20" height="160" fill="${th.ring}"></rect>`).join("");
  return `<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">${lines}${posts}</svg>`;
}

// The persistent ground under a beat: halftone at that beat's own strength, the cone on the
// three beats that carry it, and the ropes.
function arena(id, th, { halftone: o = 0.5, spotlight: lit = false } = {}) {
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    ${lit ? spotlight(id, th) : ""}
    ${halftone(id, th, o)}
    ${ropes(th)}
  </div>`;
}

function arenaTweens(id, ctx, { spotlight: lit = false } = {}) {
  const L = Math.max(0.4, ctx.L);
  const out = [
    // backgroundPosition x = clock*8 and y = clock*5 on a 40px tile: 5s and 8s per tile.
    `tl.fromTo(".${id}-htx",{x:0},{x:"${r(U(40))}cqw",duration:5,ease:"none",repeat:${reps(L, 5)}},${r(ctx.T)});`,
    `tl.fromTo(".${id}-hty",{y:0},{y:"${r(U(40))}cqw",duration:8,ease:"none",repeat:${reps(L, 8)}},${r(ctx.T)});`,
  ];
  // sin(clock*0.6) — a 10.47s cycle, so a 5.24s half-swing each way.
  if (lit) {
    out.push(`tl.fromTo(".${id}-cone",{skewX:${CONE_SKEW}},{skewX:${-CONE_SKEW},duration:5.24,ease:"sine.inOut",repeat:${reps(L, 5.24)},yoyo:true,svgOrigin:"960 1120"},${r(ctx.T)});`);
  }
  return out;
}

// ═══════════════════════════ the cast ═══════════════════════════

// IMPACT BURST (58-69) — THE CAST, and the pack's own thumbnail glyph. A 14-point star: 28
// vertices round the full circle alternating r = size and r = size*0.62, filled belt gold with a
// 6px background-colour keyline, drawn into a size*2.2 square whose viewBox is centred on the
// origin, positioned by translate(-50%,-50%) at an absolute cx/cy. The optional label is set in
// Anton at size*0.5 in the background colour and rotated -8deg.
//
// TWO NESTED ELEMENTS, NOT ONE. The reference ramps opacity over 0.08 of progress while the
// scale runs over 0.32 and then fades the whole thing out between at+0.4 and at+0.8 — three
// windows on two properties that overlap. Splitting opacity (outer) from scale (inner) keeps
// every tween sole owner of its property on its own element.
//
// The placement uses the CSS `translate` property rather than a transform so GSAP's `scale`,
// which replaces `transform` wholesale, cannot throw the burst off its coordinate.
function impact(cls, th, { cx, cy, size, label = "" }) {
  const spikes = 14, pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 ? size : size * 0.62;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    pts.push(`${r(Math.cos(a) * rad)},${r(Math.sin(a) * rad)}`);
  }
  const box = size * 2.2, half = size * 1.1;
  return `<div class="${cls}" style="position:absolute;left:${r(U(cx))}cqw;top:${r(U(cy))}cqw;width:${r(U(box))}cqw;height:${r(U(box))}cqw;translate:-50% -50%;opacity:0;z-index:12;pointer-events:none;">
    <div class="${cls}-s" style="position:absolute;inset:0;">
      <svg viewBox="${r(-half)} ${r(-half)} ${r(box)} ${r(box)}" style="position:absolute;inset:0;width:100%;height:100%;">
        <polygon points="${pts.join(" ")}" fill="${th.gold}" stroke="${th.bg}" stroke-width="6"></polygon>
      </svg>
      ${label ? `<div style="position:absolute;inset:0;display:grid;place-items:center;font-family:${th.displayStack};font-size:${r(U(size * 0.5))}cqw;line-height:1;color:${th.bg};rotate:-8deg;">${esc(label)}</div>` : ""}
    </div>
  </div>`;
}

// M.pop(progress, at, 0.32, 0.2) then a fade over at+0.4 -> at+0.8. Every window is a FRACTION
// OF SCENE PROGRESS in the reference, so all three are computed off ctx.L rather than through
// the kit's second-based at()/du().
function impactTweens(cls, ctx, { at }) {
  const L = ctx.L;
  return [
    `tl.fromTo(".${cls}",{opacity:0},{opacity:1,duration:${r(Math.max(0.05, 0.08 * L))},ease:"power1.out"},${r(ctx.T + at * L)});`,
    `tl.fromTo(".${cls}-s",{scale:0.2},{scale:1,duration:${r(Math.max(0.08, 0.32 * L))},ease:"back.out(1.7)"},${r(ctx.T + at * L)});`,
    `tl.to(".${cls}",{opacity:0,duration:${r(Math.max(0.08, 0.4 * L))},ease:"power1.in"},${r(ctx.T + (at + 0.4) * L)});`,
  ];
}

// SPEED LINES (53-57) — six full-bleed bars at y=140/300/470/640/820/940, heights alternating
// 7px and 4px, each lerping 0 -> 1400 * (0.6 + (i%3)*0.2) on easeOutExpo, filled at 0.8 alpha,
// with the whole layer fading over the back 60% of its window. Without them the entrances have
// no directional energy and the film reads as arrivals rather than as blows.
//
// The bars grow on scaleX from a left origin — a width tween is a layout property and stutters
// under the renderer's frame-by-frame seek. No hidden transform is baked into the markup: the
// `fromTo` supplies scaleX:0 and GSAP's immediateRender holds it until the cue.
const SPEED_ROWS = [140, 300, 470, 640, 820, 940];
function speedLines(cls, th, color) {
  const c = color || th.accent;
  return `<div class="${cls}" style="position:absolute;inset:0;opacity:0;pointer-events:none;z-index:11;">
    ${SPEED_ROWS.map((y, i) => {
    const w = 1400 * (0.6 + (i % 3) * 0.2);
    return `<div class="${cls}-b" style="position:absolute;left:0;top:${r(U(y))}cqw;width:${r(U(w))}cqw;height:${r(U(i % 2 ? 4 : 7))}cqw;background:${rgba(c, 0.8)};transform-origin:left center;"></div>`;
  }).join("")}
  </div>`;
}
function speedLineTweens(cls, ctx, { at = 0.1, dur = 0.32 } = {}) {
  const L = ctx.L;
  return [
    `tl.set(".${cls}",{opacity:1},${r(ctx.T + at * L)});`,
    `tl.fromTo(".${cls}-b",{scaleX:0},{scaleX:1,duration:${r(Math.max(0.08, dur * L))},ease:"expo.out"},${r(ctx.T + at * L)});`,
    `tl.to(".${cls}",{opacity:0,duration:${r(Math.max(0.08, 0.6 * dur * L))},ease:"power1.in"},${r(ctx.T + (at + 0.4 * dur) * L)});`,
  ];
}

// ═══════════════════════════ the frame camera ═══════════════════════════

// FRAME (126-145) — the reference wraps EVERY scene in three fight-specific moves, and our port
// had none of them: it had `hit()`, a single x-only 9px jolt, on two of seven layouts.
//
//   PUNCH      scale 1.14 -> 1 over the first 12% (easeOutCubic), 1 -> 1.12 over the last 10%.
//   SHAKE      sx = sin(clock*26)*amp, sy = cos(clock*23)*amp, running for the WHOLE beat at a
//              0.8px floor and spiking to 7.8px on the punch. The two periods (0.242s / 0.273s)
//              are deliberately incommensurate so the shake never resolves.
//   FLASH      a z60 screen-blended overlay, WHITE for the first half of the ramp then accent,
//              at 0.9 opacity, over progress 0 -> 0.07 and 0.94 -> 1 of every scene — so every
//              cut is a struck flash rather than a plain hard cut.
//
// ONE PROPERTY PER WRAPPER, AND ONE `fromTo` PER WRAPPER. `-shx` owns x, `-shy` owns y, and the
// punch is split across FOUR more: `-joltA`/`-punchA` for the way in and `-joltB`/`-punchB` for
// the way out. The split is not fastidiousness — a `fromTo` renders its FROM values for every
// timeline position before it starts, and its `immediateRender` fires the moment it is built, so
// an exit tween authored `{scale:1} -> {scale:1.12}` on the same element would sit on scale 1
// and flatten the entrance's 1.14 that shares it. Six wrappers buy total freedom from tween
// contention — including with `.om-cam`, which transition_kit owns and this file never touches.
//
// The ARENA IS INSIDE the shake, because the reference shakes the ring as well as the copy.
// That means a fight scene returns `backdrop: ""` and paints its ground in the content layer;
// `.om-cam` already carries `background: th.bg`, so the ground is never bare.
//
// The VIGNETTE (139-140) is a SIBLING of the shake, above the content — the reference paints it
// AFTER its children, so it darkens the type and the pictures too, which is what makes the frame
// feel like a lit arena rather than a flat page. Our port had it as the last child of the
// backdrop, i.e. inside `.om-bg`, where it darkened nothing but the ground.
function frame(id, th, { html, halftone: o = 0.5, spotlight: lit = false }) {
  const flashLayer = (cls, color, z) =>
    `<div class="${cls}" style="position:absolute;inset:0;pointer-events:none;z-index:${z};background:${color};mix-blend-mode:screen;opacity:0;"></div>`;
  return `<div class="${id}-shx" style="position:absolute;inset:0;">
    <div class="${id}-shy" style="position:absolute;inset:0;">
      <div class="${id}-joltA" style="position:absolute;inset:0;">
        <div class="${id}-joltB" style="position:absolute;inset:0;">
          <div class="${id}-punchA" style="position:absolute;inset:0;transform-origin:center center;">
            <div class="${id}-punchB" style="position:absolute;inset:0;transform-origin:center center;">
              ${arena(id, th, { halftone: o, spotlight: lit })}
              ${html}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div style="position:absolute;inset:0;pointer-events:none;z-index:50;background:radial-gradient(125% 95% at 50% 40%, transparent 42%, rgba(0,0,0,0.5) 100%);"></div>
  ${flashLayer(`${id}-fha`, th.accent, 56)}${flashLayer(`${id}-fhw`, "#FFFFFF", 57)}
  ${flashLayer(`${id}-fta`, th.accent, 58)}${flashLayer(`${id}-ftw`, "#FFFFFF", 59)}`;
}

// 0.8px baseline and 7px of punch on top of it, in cqw. A bare number here would animate PIXELS
// — a 19x amplitude error that renders as "frozen" — so every value carries its unit.
const SHAKE_AMP = U(0.8), JOLT_IN = U(7), JOLT_OUT = U(4.2);

function frameTweens(id, ctx) {
  const { T } = ctx;
  const L = Math.max(0.4, ctx.L);
  const IN = 0.12 * L, OUT = 0.1 * L;
  const HF = 0.07 * L, TF = 0.06 * L;
  return [
    // sin(clock*26) and cos(clock*23): half-periods 0.121s and 0.137s, amplitude 0.8px. A yoyo
    // of 2A over P/2 IS that sine wave. (The x axis starts at its extreme rather than at zero;
    // at 0.8px that phase offset is a fifth of a device pixel.)
    `tl.fromTo(".${id}-shx",{x:"${r(-SHAKE_AMP)}cqw"},{x:"${r(SHAKE_AMP)}cqw",duration:0.121,ease:"sine.inOut",repeat:${reps(L, 0.121)},yoyo:true},${r(T)});`,
    `tl.fromTo(".${id}-shy",{y:"${r(SHAKE_AMP)}cqw"},{y:"${r(-SHAKE_AMP)}cqw",duration:0.137,ease:"sine.inOut",repeat:${reps(L, 0.137)},yoyo:true},${r(T)});`,
    // The punch spike is an AMPLITUDE ENVELOPE on the same beat, not a separate gesture: the
    // reference's `shakeAmp = punch*7 + 0.8` decays across the punch window. GSAP cannot
    // envelope a yoyo, so the extra 7px is authored as a decaying elastic settle whose own
    // oscillation period (0.25 of a 0.12*L window on a 3.2s beat ~ 0.1s) matches the shake's.
    `tl.fromTo(".${id}-joltA",{x:"${r(JOLT_IN)}cqw",y:"${r(-JOLT_IN)}cqw"},{x:0,y:0,duration:${r(IN)},ease:"elastic.out(1,0.25)"},${r(T)});`,
    `tl.fromTo(".${id}-joltB",{x:0,y:0},{x:"${r(JOLT_OUT)}cqw",y:"${r(-JOLT_OUT)}cqw",duration:${r(OUT)},ease:"elastic.in(1,0.3)"},${r(T + 0.9 * L)});`,
    // Punch camera: 1.14 -> 1 on the way in, 1 -> 1.12 on the way out. The reference's matching
    // opacity ramp is deliberately NOT reproduced — `.om-cam` already carries the cut's own
    // fade, and doubling it would darken every arrival.
    `tl.fromTo(".${id}-punchA",{scale:1.14},{scale:1,duration:${r(IN)},ease:"power2.out"},${r(T)});`,
    `tl.fromTo(".${id}-punchB",{scale:1},{scale:1.12,duration:${r(OUT)},ease:"power2.in"},${r(T + 0.9 * L)});`,
    // HEAD FLASH. The reference swaps white for accent at the ramp's midpoint; two stacked
    // decaying layers read identically (white over accent for the first half, accent alone for
    // the second) and, unlike a mid-tween colour swap, every from-state is one the clip is
    // already hidden behind before T.
    `tl.fromTo(".${id}-fhw",{opacity:0.9},{opacity:0,duration:${r(Math.max(0.04, HF * 0.5))},ease:"none"},${r(T)});`,
    `tl.fromTo(".${id}-fha",{opacity:0.9},{opacity:0,duration:${r(Math.max(0.06, HF))},ease:"none"},${r(T)});`,
    // TAIL FLASH, building the other way: accent first, then white over the last half. These are
    // `to`s from the markup's own opacity:0 — a `fromTo` with a lit start would hold that state
    // backwards across the whole beat, because a GSAP tween renders its from-values for every
    // time before it begins.
    `tl.to(".${id}-fta",{opacity:0.9,duration:${r(Math.max(0.06, TF))},ease:"none"},${r(T + 0.94 * L)});`,
    `tl.to(".${id}-ftw",{opacity:0.9,duration:${r(Math.max(0.04, TF * 0.5))},ease:"none"},${r(T + 0.97 * L)});`,
    // The cut lands at T+L. The clip lives on past it for the length of the xfade, so both tail
    // layers must be extinguished there or the outgoing scene wipes out under a white sheet.
    `tl.set(".${id}-fta",{opacity:0},${r(T + L)});`,
    `tl.set(".${id}-ftw",{opacity:0},${r(T + L)});`,
  ];
}

// ═══════════════════════════ chrome ═══════════════════════════

// CHROME (113-123) — the reference's own section header says "(no scene numbers)". It is a
// 45deg accent square beside the brand in Anton 26; a 2Hz-BLINKING accent lamp beside the beat
// label; and a foot rule of a gold star, a hairline and the url. No counter, no progress bar.
//
// Supplying this from every builder is what stops om_port_kit.open() falling back to the kit HUD
// — a rounded brand badge, a "ROUND 01 OF 06" counter and a film-wide progress rule, i.e. the
// exact element the reference names as absent.
function chrome(id, th, { brand, label, url }) {
  return `<div class="om-chrome">
    <div style="position:absolute;top:${r(U(40))}cqw;left:${r(U(60))}cqw;display:flex;align-items:center;gap:${r(U(12))}cqw;font-family:${th.displayStack};font-size:${r(U(26))}cqw;letter-spacing:0.02em;color:${th.ink};white-space:nowrap;">
      <span style="width:${r(U(16))}cqw;height:${r(U(16))}cqw;background:${th.accent};rotate:45deg;flex:0 0 auto;"></span>${esc(String(brand || "").toUpperCase())}
    </div>
    ${label ? `<div style="position:absolute;top:${r(U(46))}cqw;right:${r(U(60))}cqw;display:flex;align-items:center;gap:${r(U(10))}cqw;font-family:${th.condStack};font-weight:600;font-size:${r(U(16))}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${th.ink};white-space:nowrap;">
      <span class="${id}-lamp" style="width:${r(U(10))}cqw;height:${r(U(10))}cqw;border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>${esc(label)}
    </div>` : ""}
    <div style="position:absolute;bottom:${r(U(40))}cqw;left:${r(U(60))}cqw;right:${r(U(60))}cqw;display:flex;align-items:center;gap:${r(U(14))}cqw;font-family:${th.condStack};font-weight:600;font-size:${r(U(15))}cqw;letter-spacing:0.18em;text-transform:uppercase;color:${th.sub};">
      <span style="color:${th.gold};flex:0 0 auto;">&#9733;</span>
      <div style="flex:1 1 auto;height:${r(U(2))}cqw;background:${rgba(th.ink, 0.15)};"></div>
      <span style="flex:0 0 auto;white-space:nowrap;">${esc(url)}</span>
    </div>
  </div>`;
}
// `Math.floor(clock*2) % 2` — a hard 0.5s on/off, not a fade, so the ease is steps(1).
const chromeTweens = (id, ctx) => [
  `tl.fromTo(".${id}-lamp",{opacity:1},{opacity:0.3,duration:0.5,ease:"steps(1)",repeat:${reps(Math.max(0.5, ctx.L), 0.5)},yoyo:true},${r(ctx.T)});`,
];

// ═══════════════════════════ product mounts ═══════════════════════════

// JUMBOTRON (83-90) — the arena screen, and the reason the Champion beat is an arena beat: a
// 14px-padded gradient body, a 3px gold keyline, a 60px gold bloom over a deep drop shadow, and
// a 90x18 hanger TAB centred above it with gold side edges. Our port drew a tilted card with a
// name badge instead, which turns the arena screen into a boxing-poster headshot.
function jumbotron(th, inner) {
  return `<div style="width:100%;height:100%;position:relative;padding:${r(U(14))}cqw;background:linear-gradient(${th.ring}, ${th.bg});border:${r(U(3))}cqw solid ${th.gold};box-shadow:0 0 ${r(U(60))}cqw ${rgba(th.gold, 0.3)}, 0 ${r(U(40))}cqw ${r(U(80))}cqw rgba(0,0,0,0.6);">
    <div style="position:absolute;top:${r(-U(18))}cqw;left:50%;translate:-50% 0;width:${r(U(90))}cqw;height:${r(U(18))}cqw;background:${th.ring};border-left:${r(U(3))}cqw solid ${th.gold};border-right:${r(U(3))}cqw solid ${th.gold};"></div>
    <div style="position:relative;width:100%;height:100%;overflow:hidden;background:${th.panel};">${inner}</div>
  </div>`;
}

// PHONE (91-98) — the film's only portrait mount and its only device mockup: a 42px-radius body
// on #05050A with a 2px gold keyline, a 50px gold bloom, a 88x22 notch and a 32px-radius screen.
const PHONE_BODY = "#05050A";
function phone(th, inner) {
  return `<div style="width:100%;height:100%;position:relative;border-radius:${r(U(42))}cqw;padding:${r(U(12))}cqw;background:${PHONE_BODY};border:${r(U(2))}cqw solid ${th.gold};box-shadow:0 0 ${r(U(50))}cqw ${rgba(th.gold, 0.25)};">
    <div style="position:absolute;top:${r(U(22))}cqw;left:50%;translate:-50% 0;width:${r(U(88))}cqw;height:${r(U(22))}cqw;border-radius:${r(U(22))}cqw;background:${PHONE_BODY};z-index:2;"></div>
    <div style="position:relative;width:100%;height:100%;border-radius:${r(U(32))}cqw;overflow:hidden;background:${th.panel};">${inner}</div>
  </div>`;
}

// LOGO DIAMOND (StepInRing 260) — a 140x140 canvas plate on a 3px gold keyline, rotated 45deg,
// holding a counter-rotated 150x150 box for the mark. The rotation is the CSS `rotate` property,
// not a transform, so the GSAP scale-in cannot replace it.
function logoDiamond(th, cls, src) {
  return `<div class="${cls}" style="width:${r(U(140))}cqw;height:${r(U(140))}cqw;background:${th.panel};border:${r(U(3))}cqw solid ${th.gold};rotate:45deg;display:grid;place-items:center;overflow:hidden;margin-bottom:${r(U(40))}cqw;opacity:0;">
    <div style="rotate:-45deg;width:${r(U(150))}cqw;height:${r(U(150))}cqw;padding:${r(U(18))}cqw;display:flex;align-items:center;justify-content:center;">
      <img src="${esc(src)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;display:block;">
    </div>
  </div>`;
}

// ═══════════════════════════ the skew vocabulary ═══════════════════════════
//
// EVERY PLATE IN THE FILM IS SHEARED (100, 108, 158, 237, 263): the tagline and CTA pills at
// skewX(-8), the stat card at -6, the health-bar track at -12 and the combo chip at -8, each
// with a counter-skewed inner span so the type stays upright. That shear is what makes the film
// read as a fight poster rather than as a UI, and the string "skew" appeared nowhere in our
// port — its ±3deg card rotation is a different gesture entirely (an italicising of the
// architecture versus a snapshot pinned to a board).
//
// The shear always sits on a STATIC element and the entrance always animates its parent. GSAP
// decomposes an existing matrix when it tweens a transform, and relying on that round-trip to
// preserve a skew is a bet this file does not need to take.

// TAGLINE PILL (158) — accent-filled, Oswald 700/26/0.14em.
function taglinePill(th, cls, text) {
  return `<div class="${cls}" style="display:inline-block;opacity:0;">
    <div style="display:inline-block;background:${th.accent};color:${th.inkOnAccent};padding:${r(U(10))}cqw ${r(U(28))}cqw;transform:skewX(-8deg);font-family:${th.condStack};font-weight:700;font-size:${r(U(26))}cqw;letter-spacing:0.14em;text-transform:uppercase;">
      <span style="display:inline-block;transform:skewX(8deg);">${esc(text)}</span>
    </div>
  </div>`;
}

// TAG CHIP (99-101) — the combo strike: a canvas block on a 2px accent border with a gold Anton
// index, thrown in on M.slam from 1.5.
function tagChip(th, cls, { n, text }) {
  return `<div class="${cls}" style="display:inline-block;opacity:0;transform-origin:left center;">
    <div style="display:inline-flex;align-items:center;padding:${r(U(10))}cqw ${r(U(20))}cqw;background:${th.panel};border:${r(U(2))}cqw solid ${th.accent};transform:skewX(-8deg);font-family:${th.condStack};font-weight:600;font-size:${r(U(18))}cqw;letter-spacing:0.08em;text-transform:uppercase;color:${th.ink};white-space:nowrap;">
      <span style="display:inline-block;transform:skewX(8deg);"><span style="color:${th.gold};font-family:${th.displayStack};margin-right:${r(U(8))}cqw;">${esc(n)}</span>${esc(text)}</span>
    </div>
  </div>`;
}

// STAT PLATE (236-243) — a 280px skewX(-6) card on a gold@0.6 keyline, the figure in Anton 96
// belt gold above an Oswald 600/18/0.16em label. `nCls` is the node the counter writes into.
function statPlate(th, cls, { nCls, suffix, label }) {
  return `<div class="${cls}" style="width:${r(U(280))}cqw;flex:0 0 auto;opacity:0;">
    <div style="background:${th.panel};border:${r(U(2))}cqw solid ${rgba(th.gold, 0.6)};padding:${r(U(26))}cqw ${r(U(30))}cqw;transform:skewX(-6deg);">
      <div style="transform:skewX(6deg);">
        <div style="font-family:${th.displayStack};font-size:${r(U(96))}cqw;line-height:0.9;color:${th.gold};white-space:nowrap;"><span class="${nCls}">0</span>${esc(suffix)}</div>
        <div style="font-family:${th.condStack};font-weight:600;font-size:${r(U(18))}cqw;letter-spacing:0.16em;text-transform:uppercase;color:${th.ink};margin-top:${r(U(4))}cqw;white-space:nowrap;overflow:hidden;">${esc(label)}</div>
      </div>
    </div>
  </div>`;
}

// HEALTH BAR (103-111) — the judges' meter: a 20px skewX(-12) track on a 2px ink@0.3 border,
// filled by an accent -> gold gradient, under an Oswald 600/20/0.1em label with the figure in
// belt gold at the right.
//
// The fill is a STATIC width tweened on scaleX from a left origin. Animating `width` is a layout
// property: it snaps to integer device pixels under the renderer's frame-by-frame seek and
// re-flows the page every frame.
function healthBar(th, cls, { label, value, frac }) {
  return `<div class="${cls}" style="margin-bottom:${r(U(22))}cqw;opacity:0;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:${r(U(16))}cqw;font-family:${th.condStack};font-weight:600;font-size:${r(U(20))}cqw;letter-spacing:0.1em;text-transform:uppercase;color:${th.ink};margin-bottom:${r(U(8))}cqw;">
      <span style="overflow:hidden;white-space:nowrap;">${esc(label)}</span><span style="color:${th.gold};white-space:nowrap;flex:0 0 auto;">${esc(value)}</span>
    </div>
    <div style="height:${r(U(20))}cqw;background:${th.panel};border:${r(U(2))}cqw solid ${rgba(th.ink, 0.3)};transform:skewX(-12deg);overflow:hidden;">
      <div class="${cls}-f" style="height:100%;width:${r(Math.max(4, Math.min(100, frac * 100)))}%;background:linear-gradient(90deg, ${th.accent}, ${th.gold});transform-origin:left center;"></div>
    </div>
  </div>`;
}

module.exports = {
  arena, arenaTweens, frame, frameTweens, chrome, chromeTweens,
  impact, impactTweens, speedLines, speedLineTweens,
  jumbotron, phone, logoDiamond, taglinePill, tagChip, statPlate, healthBar,
  U, rgba, SPEED_ROWS,
};
