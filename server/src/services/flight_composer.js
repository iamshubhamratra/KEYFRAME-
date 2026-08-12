// FLIGHT — a departure film. Native GSAP + DOM/SVG, built on om_port_kit.
//
// PROVENANCE. A scene-for-scene port of the Claude Design handoffs
// `old-templete/all-template-handoffs/Flight/src/flight-film.jsx` (1920x1080, 6 scenes,
// transition="cut") and `.../FlightVertical/src/flightvert-film.jsx` (1080x1920). Layout,
// geometry, type scale, colour and cast are reproduced; none of the copy is.
//
// ONE MODULE, TWO ASPECTS. The reference ships the vertical as a separate 25K file that is the
// same film re-laid. Here the layouts BRANCH on `stage.portrait` instead — but they branch onto
// the VERTICAL REFERENCE'S OWN NUMBERS, not onto a shrunken copy of the landscape ones. That
// distinction is the whole point of the 10 Aug 2026 rebuild: the previous port derived portrait
// from landscape by fraction, so every display ceiling in 9:16 came out at about HALF what
// flightvert-film.jsx authors (opener 104 against 210), both of its device frames collapsed into
// one generic rounded panel, and its lower bands ran underneath the caption pill.
//
// HOW THE GEOMETRY IS PORTED. The cast — sky, sun, clouds, runway, aircraft, gauge — is drawn
// inside an `<svg viewBox="0 0 W H">` at the reference's EXACT pixel coordinates, so there is no
// unit conversion to get wrong (the same method as orbit_composer.js). Only DOM text and the
// device mounts use the kit's cqw scale (U), because only they have to reflow for AI-authored
// copy of unknown length. Every literal below carries the reference line it came from.
//
// HOW CONTINUOUS MOTION IS PORTED. The reference is React re-evaluated every frame and reads
// `Math.sin(clock * k)` straight into styles; KEYFRAME seeks ONE paused timeline, so each of
// those becomes a repeating yoyo tracing the same curve — same amplitude, same period:
//   climb plane + card   sin(t*0.8)*8   -> period 7.85s, half-cycle 3.93s, 16px yoyo
//   cruise tiles         sin(t*0.7+i)*8 -> period 8.98s, half-cycle 4.49s, phase-staggered
//   gauge needle jitter  sin(clock*2)*3 -> period 3.14s, half-cycle 1.57s, 6deg yoyo
//   cloud drift          16 / 30 px/s (landscape), 26 px/s (portrait) — linear, per band
//
// FONT SUBSTITUTION: none — the reference's Manrope + DM Mono are both bundled
// (see src/fonts/pack_fonts.js). frames/flight/pack.json still names Figtree/JetBrains Mono and
// is stale relative to this file; the manifest is not ours to edit.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

// ---- the reference ThemeContext, verbatim (flight-film.jsx:6-10, flightvert-film.jsx:5-9) ----
const SKY_A = "#BFE6FF", SKY_B = "#8FCBF5", SKY_C = "#E9F6FF";
// DAYLIGHT, NOT LIVERY. See the note on `theme()` below.
const SUN = "#FFE08A", SUN_CORE = "#FFF3D0";
const GROUND = "#39404A", RUNWAY = "#474E58", MARK = "#F2F5F9";
const INK = "#16222E", PAPER = "#FFFFFF", BODY = "#EEF3F8", BODY_DK = "#C9D4DE";
// Airframe hardware — cabin glass, nacelle, intake shadow, gear strut, wheel (flight-film.jsx:76, 91, 99).
const GLASS = "#26506E", NACELLE = "#3A4652", INTAKE = "#1B242C", STRUT = "#2A333C", WHEEL = "#20272E";
// Browser chrome: the title bar and the three traffic lights (flight-film.jsx:122-123).
const BAR = "#F4F7FB", LAMPS = ["#FF5F57", "#FEBC2E", "#28C840"];
const ACCENT = "#FF5630";
const DISPLAY = "Manrope", MONO = "DM Mono";

const STRINGS = {
  gate: "PRE-FLIGHT", takeoff: "DEPARTURE", climb: "CLIMB", cruise: "IN-FLIGHT",
  instruments: "FLIGHT DATA", scene: "LEG", of: "OF", go: "BOOK YOUR SEAT",
  cleared: "CLEARED FOR TAKEOFF",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: SKY_C, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: SKY_C, panel: PAPER, ink: INK, sub: "#5C6B7A", line: BODY_DK,
    skyA: SKY_A, skyB: SKY_B, skyC: SKY_C, ground: GROUND, runway: RUNWAY,
    // AIRFRAME LIVERY. The reference's `body` / `bodyDk` — a near-white hull with a cool grey
    // shadow side. They are the colour of PAINTED ALUMINIUM, not a brand slot: a rebranded
    // airline still flies a white aircraft with a coloured stripe, which is exactly what the
    // accent does (tail fin, livery stripe, intake ring, runway edge lights).
    body: BODY, bodyDk: BODY_DK, mark: MARK,
    // THE SUN IS A STAR, NOT FURNITURE. This used to be `K.spin(accent, 26, 0.3, 0.75)` — the
    // brand accent rotated 26 degrees and forced to saturation >= 0.75 — so a blue or violet
    // brand lit the sky with a blue or violet sun, and the #FFF3D0 hot core was never drawn at
    // all. Sunlight is a property of the WORLD, in the same class as orbit's rocket flame and
    // terminal-departures' ON-TIME green: fixed literals, never brand-derived. The composer had
    // already made exactly this argument one line above, for the aluminium hull.
    sun: SUN, sunCore: SUN_CORE,
    adv: K.ADVANCE.mixed,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO),
    resolvedBrand,
  };
}

// ═══════════════════════════ per-aspect reference geometry ═══════════════════════════
//
// Everything here is a literal read off the two handoff files. Nothing is a fraction of the
// frame: `horizon = VH * 0.68` was an invented constant that put 32% of the landscape frame under
// tarmac where the reference authors 16% (GROUND_Y = 902 of 1080; GY = 1560 of 1920).

const GEO_L = {
  groundY: 902, band: 86, lip: 4, dashY: 40, dashUnit: 200, dashW: 110, dashH: 8,
  lights: true, lightPitch: 110, lightY: 82, lightR: 4,
  sun: { cx: 1520, cy: 230, r: 120, core: 72 },                       // flight-film.jsx:55
  // Two parallax bands at 16 and 30 px/s — the film's whole sense of airspeed (flight-film.jsx:56-57).
  bands: [
    { speed: 16, clouds: [{ x: 300, y: 200, s: 1, o: 0.9 }, { x: 1100, y: 150, s: 1.3, o: 0.85 }, { x: 1750, y: 280, s: 0.8, o: 0.8 }] },
    { speed: 30, clouds: [{ x: 700, y: 430, s: 0.7, o: 0.7 }, { x: 1500, y: 520, s: 0.9, o: 0.6 }] },
  ],
};
const GEO_P = {
  groundY: 1560, band: 70, lip: 4, dashY: 30, dashUnit: 200, dashW: 110, dashH: 8,
  // The vertical cut draws no runway edge lights (flightvert-film.jsx:65) — at 1080 wide the
  // 110px pitch would read as a dotted rule rather than as lights.
  lights: false, lightPitch: 110, lightY: 82, lightR: 4,
  sun: { cx: 880, cy: 250, r: 120, core: 72 },                        // flightvert-film.jsx:63
  bands: [
    { speed: 26, clouds: [{ x: 220, y: 430, s: 0.9, o: 0.9 }, { x: 780, y: 340, s: 1.1, o: 0.85 }, { x: 1200, y: 560, s: 0.7, o: 0.8 }] },
  ],
};

// Display ceilings and body sizes, per aspect, in REFERENCE PIXELS. `K.fitLines` / `K.fitOne`
// shrink them for long AI copy — matching the CEILING is the requirement, not printing at it.
const TYPE_L = {
  gateWord: 190, gateLh: 0.9, gateTop: 190, tagSize: 24, tagTrack: "0.22em", tagPadY: 8, tagPadX: 22,
  leadSize: 27, leadLh: 1.5, leadMax: 940,
  toHead: 118, toHeadLh: 0.92, toBrow: 20, toBody: 27, toBodyMax: 680,
  clHead: 84, clHeadLh: 0.98, clBrow: 18, clBody: 25, clBodyLh: 1.55, chipSize: 15, chipDot: 8, chipPadY: 9, chipPadX: 16,
  crHead: 66, crSub: 26, crSubMax: 1080,
  inHead: 92, inHeadLh: 0.94, inBody: 25, inBodyMax: 600, inNum: 90, inLabel: 15, inLabelTrack: "0.14em",
  arHead: 132, arHeadLh: 0.9, arBody: 27, arBodyMax: 780, arCta: 32, arGlyph: 30, arUrl: 22,
};
const TYPE_P = {
  gateWord: 210, gateLh: 0.88, gateTop: 300, tagSize: 30, tagTrack: "0.2em", tagPadY: 12, tagPadX: 30,
  leadSize: 34, leadLh: 1.4, leadMax: 840,
  toHead: 150, toHeadLh: 0.92, toBrow: 28, toBody: 34, toBodyMax: 800,
  clHead: 118, clHeadLh: 0.96, clBrow: 26, clBody: 30, clBodyLh: 1.45, chipSize: 26, chipDot: 11, chipPadY: 14, chipPadX: 26,
  crHead: 100, crSub: 30, crSubMax: 900,
  inHead: 118, inHeadLh: 0.94, inBody: 30, inBodyMax: 800, inNum: 130, inLabel: 24, inLabelTrack: "0.14em",
  arHead: 150, arHeadLh: 0.92, arBody: 30, arBodyMax: 800, arCta: 50, arGlyph: 44, arUrl: 30,
};

// The two device mounts, per aspect (flight-film.jsx:119-137 / flightvert-film.jsx:82-97).
const CARD_L = { radius: 18, bar: 44, lamp: 12, gap: 8, padX: 18, pill: 24, pillR: 12, pillMax: 380, font: 12 };
const CARD_P = { radius: 22, bar: 54, lamp: 15, gap: 10, padX: 22, pill: 28, pillR: 14, pillMax: 460, font: 15 };
const PHONE_L = { radius: 44, pad: 12, notchW: 90, notchH: 22, notchTop: 22, inner: 33 };
const PHONE_P = { radius: 60, pad: 16, notchW: 150, notchH: 34, notchTop: 30, inner: 46 };

// Cruise mosaics. Landscape is the reference's deliberately unequal two-row layout
// (flight-film.jsx:256-259); portrait is the vertical cut's alternating full-bleed stack
// (flightvert-film.jsx:191, 196 — `left: i%2 ? 340 : 80` against the mirrored `right`).
const CRUISE_L = [
  { x: 190, y: 340, w: 416, h: 240, kind: "desktop" },
  { x: 720, y: 312, w: 288, h: 240, kind: "phone" },
  { x: 1160, y: 340, w: 528, h: 240, kind: "desktop" },
  { x: 400, y: 636, w: 448, h: 200, kind: "desktop" },
  { x: 1000, y: 636, w: 512, h: 200, kind: "desktop" },
];
const CRUISE_P = [
  { x: 80, y: 340, w: 660, h: 420, kind: "desktop" },
  { x: 340, y: 800, w: 660, h: 420, kind: "desktop" },
  { x: 80, y: 1260, w: 660, h: 420, kind: "desktop" },
];

// ---- furniture (stage-aware) -------------------------------------------------
function makeKit(stage) {
  const { U, portrait } = stage;
  const SW = stage.W, SH = stage.H;                     // the reference's own pixel stage
  const W = U(SW), VH = stage.VH;
  const G = portrait ? GEO_P : GEO_L;
  const T = portrait ? TYPE_P : TYPE_L;
  const CARD = portrait ? CARD_P : CARD_L;
  const PHONE = portrait ? PHONE_P : PHONE_L;
  const TILES = portrait ? CRUISE_P : CRUISE_L;
  // The reference's own text margins: 110 in landscape (Climb / Instruments / Arrival all set
  // left:110), 60 in portrait (every copy block is `left:60; right:60`).
  const M = U(portrait ? 60 : 110);
  const COL = W - M * 2;

  // THE BOTTOM CAPTION RESERVE. `#caps` reserves U(150) of padding in portrait / U(96) in
  // landscape (om_port_kit.baseCss) and the pill itself is ~U(66) tall on top of that. The
  // reference has no captions, so its portrait Climb phone runs to y=1760 and its Cruise stack to
  // y=1680 — under our pill. Anything that would cross this line is clamped to it instead.
  const CAP_TOP = VH - U(portrait ? 216 : 162);

  // ── sky, sun, clouds, runway ────────────────────────────────────────────────
  const cloud = (c) => `<g transform="translate(${c.x} ${c.y}) scale(${c.s})" opacity="${c.o}" fill="#FFFFFF"><ellipse cx="0" cy="0" rx="96" ry="40"></ellipse><ellipse cx="76" cy="14" rx="62" ry="30"></ellipse><ellipse cx="-70" cy="16" rx="54" ry="26"></ellipse><rect x="-120" y="6" width="250" height="40" rx="20"></rect></g>`;

  // The runway is THREE plates and TWO mark rows, not a gradient: a ground plane, an 86px (70 in
  // portrait) runway band, a 4px white lip along its top edge, a scrolling row of 110x8 centreline
  // dashes and — in landscape — a row of accent edge lights, the accent's only appearance on the
  // ground. `travel` is how far the mark rows will scroll during this beat, so enough of them are
  // drawn to cover the whole run: the row is translated, never re-tiled.
  function runwayG(id, th, travel) {
    const span = SW + Math.max(0, travel) + G.dashUnit * 2;
    const nDash = Math.ceil(span / G.dashUnit);
    const nLight = G.lights ? Math.ceil(span / G.lightPitch) : 0;
    const dashes = Array.from({ length: nDash }, (_, i) =>
      `<rect x="${i * G.dashUnit - G.dashUnit}" y="${G.groundY + G.dashY}" width="${G.dashW}" height="${G.dashH}" rx="4" fill="${th.mark}" opacity="0.9"></rect>`).join("");
    const lights = Array.from({ length: nLight }, (_, i) =>
      `<circle cx="${i * G.lightPitch}" cy="${G.groundY + G.lightY}" r="${G.lightR}" fill="${rgba(th.accent, 0.8)}"></circle>`).join("");
    return `<g class="${id}-rw">
      <rect x="0" y="${G.groundY}" width="${SW}" height="${SH - G.groundY + 200}" fill="${th.ground}"></rect>
      <rect x="0" y="${G.groundY}" width="${SW}" height="${G.band}" fill="${th.runway}"></rect>
      <rect x="0" y="${G.groundY}" width="${SW}" height="${G.lip}" fill="${rgba("#FFFFFF", 0.25)}"></rect>
      <g class="${id}-marks">${dashes}${lights}</g>
    </g>`;
  }

  // THE SKY GRADIENT RUNS PALE -> DEEP -> PALE. #BFE6FF at 0%, #8FCBF5 at 70%, #E9F6FF at 100%:
  // a pale zenith that deepens three quarters down and goes palest again at the horizon, which is
  // the haze band of a real sky. The port had the first two stops transcribed the other way round,
  // so the deepest blue sat at the top of frame and the sky lightened monotonically downward —
  // an inverted sky under every frame of the film.
  //
  // `ground` is false on four of the six beats: the reference renders `Runway` only inside Gate
  // and Takeoff (flight-film.jsx:192, 218). Once the aircraft is airborne the sky owns the whole
  // frame, and painting tarmac under Climb / Cruise / Instruments / Arrival is what made the
  // earlier cut read as a film shot from the apron.
  function sky(id, th, { ground = false, travel = 0 } = {}) {
    const bands = G.bands.map((b, bi) =>
      `<g class="${id}-cb${bi}">${b.clouds.map(cloud).join("")}</g>`).join("");
    return `<div style="position:absolute;inset:0;background:${th.skyB};overflow:hidden;">
      <svg viewBox="0 0 ${SW} ${SH}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;">
        <defs><linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${th.skyA}"></stop>
          <stop offset="0.7" stop-color="${th.skyB}"></stop>
          <stop offset="1" stop-color="${th.skyC}"></stop>
        </linearGradient></defs>
        <rect x="0" y="0" width="${SW}" height="${SH}" fill="url(#${id}sky)"></rect>
        <circle cx="${G.sun.cx}" cy="${G.sun.cy}" r="${G.sun.r}" fill="${th.sun}" opacity="0.5"></circle>
        <circle cx="${G.sun.cx}" cy="${G.sun.cy}" r="${G.sun.core}" fill="${th.sunCore}"></circle>
        ${bands}
        ${ground ? runwayG(id, th, travel) : ""}
      </svg>
    </div>`;
  }
  // Each band drifts at its authored px/s for exactly the length of the beat. The reference wraps
  // on a 2400px modulus; at 16-30 px/s over a 3-6s beat nothing travels more than ~180px, so the
  // wrap is unreachable inside a cut and a second copy of each cluster would never be seen.
  // These are SVG groups, so GSAP's x is in user units — the reference's own pixels.
  const skyTweens = (id, ctx) => G.bands.map((b, bi) =>
    `tl.fromTo(".${id}-cb${bi}",{x:0},{x:${r(-b.speed * ctx.L)},duration:${r(Math.max(0.4, ctx.L))},ease:"none"},${r(ctx.T)});`);

  // The ground rush. Gate idles at 120px/s (flight-film.jsx:192); Takeoff runs
  // `localTime*900*(0.4+roll)` — 360px/s at brake release accelerating to 1260px/s at rotation
  // (flight-film.jsx:212) — which is the cue that sells V1. A single accelerating tween traces the
  // same curve; `power2.in` over a mean of ~0.8 of the peak is that integral.
  const marksTween = (id, ctx, travel, ease) =>
    `tl.fromTo(".${id}-marks",{x:0},{x:${r(-travel)},duration:${r(Math.max(0.4, ctx.L))},ease:"${ease}"},${r(ctx.T)});`;

  // ── the aircraft ────────────────────────────────────────────────────────────
  // Transcribed from the reference `Plane` (flight-film.jsx:75-102): swept tail fin and its
  // fillet, a shaped fuselage with a shadowed underside, the accent livery stripe, a wing sweeping
  // down and back, an engine nacelle with an accent intake ring, ELEVEN cabin windows, cockpit
  // glass and retractable gear. Drawn in x∈[-186,186], y∈[-78,66]; the viewBox is the 400x200 box
  // around it so the wrapper's centre IS the reference's (x, y).
  const plane = (cls, th, { pitch = 0, contrail = false, gear = true }) => {
    const trail = contrail ? `<g class="${cls}-trail" opacity="0.7">
      <path d="M-150 26 q -120 -6 -300 4" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="12" stroke-linecap="round" opacity="0.6"></path>
      <path d="M-150 40 q -120 -6 -300 4" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="12" stroke-linecap="round" opacity="0.4"></path>
    </g>` : "";
    const wheels = gear ? `<g stroke="${STRUT}" stroke-width="6" stroke-linecap="round">
      <line x1="-40" y1="22" x2="-40" y2="52"></line><circle cx="-40" cy="56" r="10" fill="${WHEEL}"></circle>
      <line x1="120" y1="22" x2="120" y2="52"></line><circle cx="120" cy="56" r="10" fill="${WHEEL}"></circle>
    </g>` : "";
    return `<svg class="${cls}" viewBox="-200 -100 400 200" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">
      <g transform="rotate(${r(-pitch)})">
        ${trail}
        <path d="M-132 -14 L-186 -78 L-150 -78 L-108 -16 Z" fill="${th.accent}"></path>
        <path d="M-120 -6 L-176 -10 L-150 12 L-120 14 Z" fill="${th.bodyDk}"></path>
        <path d="M-160 6 Q -172 0 -150 -18 L120 -22 Q 176 -18 186 0 Q 176 18 120 22 L-150 22 Q -168 12 -160 6 Z" fill="${th.body}"></path>
        <path d="M-150 14 L186 6 Q 176 18 120 22 L-150 22 Q -168 18 -150 14 Z" fill="${th.bodyDk}" opacity="0.6"></path>
        <rect x="-150" y="-4" width="330" height="8" rx="4" fill="${th.accent}"></rect>
        <path d="M40 8 L-58 76 L-6 76 L74 12 Z" fill="${th.bodyDk}"></path>
        <g transform="translate(2 40)">
          <ellipse cx="0" cy="0" rx="42" ry="18" fill="${NACELLE}"></ellipse>
          <ellipse cx="38" cy="0" rx="9" ry="15" fill="${th.accent}"></ellipse>
          <ellipse cx="-40" cy="0" rx="7" ry="12" fill="${INTAKE}"></ellipse>
        </g>
        ${Array.from({ length: 11 }, (_, i) => `<circle cx="${-92 + i * 20}" cy="-6" r="4.5" fill="${GLASS}"></circle>`).join("")}
        <path d="M150 -14 Q 176 -12 182 -2 L156 0 L150 -12 Z" fill="${GLASS}"></path>
        ${wheels}
      </g>
    </svg>`;
  };
  // Place the aircraft at the reference's own stage coordinates and scale. The wrapper carries the
  // FULL 400x200 box (not a zero-size point), so a GSAP rotation turns the airframe about its own
  // centre rather than about a corner.
  const planeAt = (cls, th, { x, y, scale = 1, z = 3, ...opts }) => {
    const w = U(400 * scale), h = U(200 * scale);
    return `<div class="${cls}" style="position:absolute;left:${r(U(x) - w / 2)}cqw;top:${r(U(y) - h / 2)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};">${plane(`${cls}-p`, th, opts)}</div>`;
  };

  // SPEED LINES pinned to the NOSE. The reference draws them at (px-160, py) — recomputed every
  // frame from the aircraft's own position, so the streaks stay with it through the whole roll
  // (flight-film.jsx:219). They live in their own wrapper rather than inside the aircraft's, so
  // the takeoff rotation does not tip them: air tearing past an airframe is horizontal.
  const SPEED = portrait
    ? { anchor: 150, n: 4, len0: 110, step: 30, dy: 24 }      // flightvert-film.jsx:154
    : { anchor: 160, n: 6, len0: 60, step: 30, dy: 20 };      // flight-film.jsx:104, 219
  const speedAt = (cls, th, { x, y }) => {
    const fanW = SPEED.len0 + SPEED.step * (SPEED.n - 1);
    const top = SPEED.dy * 2, hgt = SPEED.dy * (SPEED.n + 1);
    const lines = Array.from({ length: SPEED.n }, (_, i) =>
      `<line x1="${fanW}" y1="${top - SPEED.dy * 2 + i * SPEED.dy}" x2="${fanW - SPEED.len0 - SPEED.step * i}" y2="${top - SPEED.dy * 2 + i * SPEED.dy}"></line>`).join("");
    return `<div class="${cls}" style="position:absolute;left:${r(U(x - SPEED.anchor - fanW))}cqw;top:${r(U(y - SPEED.dy * 2))}cqw;width:${r(U(fanW))}cqw;height:${r(U(hgt))}cqw;z-index:2;opacity:0;">
      <svg viewBox="0 0 ${fanW} ${hgt}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">
        <g stroke="${rgba(th.ink, 0.22)}" stroke-width="4" stroke-linecap="round">${lines}</g>
      </svg></div>`;
  };

  // ── the instrument gauge (flight-film.jsx:142-148) ──────────────────────────
  // An analogue dial: a paper face with a 4px ink keyline, a 130deg->410deg track, nine ticks, an
  // ACCENT value arc that sweeps over 0.7 of the beat, a 6px accent needle and a 12px ink hub.
  // This is the only furniture that makes a figures beat read as FLIGHT DATA rather than as any
  // pack's numbers slide — the earlier port drew none of it, and the word "INSTRUMENTS" survived
  // only as a chrome label.
  const dialPt = (cx, cy, deg, rr) => [cx + Math.cos(deg * Math.PI / 180) * rr, cy + Math.sin(deg * Math.PI / 180) * rr];
  const dialArc = (cx, cy, rr, a0, a1) => {
    const [x1, y1] = dialPt(cx, cy, a0, rr), [x2, y2] = dialPt(cx, cy, a1, rr);
    return `M${r(x1)} ${r(y1)} A ${rr} ${rr} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${r(x2)} ${r(y2)}`;
  };
  const A0 = 130, A1 = 410;
  function gauge(id, th, { cx, cy, rad }) {
    const len = ((A1 - A0) / 360) * 2 * Math.PI * rad;
    const ticks = Array.from({ length: 9 }, (_, i) => {
      const d = A0 + (A1 - A0) * (i / 8);
      const [x1, y1] = dialPt(cx, cy, d, rad - 20), [x2, y2] = dialPt(cx, cy, d, rad - 6);
      return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${th.ink}" stroke-width="3"></line>`;
    }).join("");
    return `<g class="${id}-dial" opacity="0">
      <circle cx="${cx}" cy="${cy}" r="${rad + 16}" fill="${th.panel}" stroke="${th.ink}" stroke-width="4"></circle>
      <path d="${dialArc(cx, cy, rad, A0, A1)}" fill="none" stroke="${rgba(th.ink, 0.14)}" stroke-width="12" stroke-linecap="round"></path>
      ${ticks}
      <path class="${id}-arc" d="${dialArc(cx, cy, rad, A0, A1)}" fill="none" stroke="${th.accent}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${r(len)}" stroke-dashoffset="${r(len)}"></path>
      <g transform="translate(${cx} ${cy})"><g class="${id}-nd"><g class="${id}-nj">
        <line x1="0" y1="0" x2="${rad - 22}" y2="0" stroke="${th.accent}" stroke-width="6" stroke-linecap="round"></line>
      </g></g></g>
      <circle cx="${cx}" cy="${cy}" r="12" fill="${th.ink}"></circle>
    </g>`;
  }
  // The needle sweeps A0 -> A1 over 0.7 of progress on easeOutCubic and then carries a continuous
  // +-3deg jitter at sin(clock*2) — period 3.14s, so a 6deg yoyo over 1.57s. Sweep and jitter own
  // rotation on TWO nested groups: one element, one animator, per the kit's layer rule. The outer
  // <g transform="translate(cx cy)"> is never animated, because GSAP replaces the whole transform
  // attribute the moment it touches rotation (the lesson orbit's ring learned the hard way).
  const gaugeTweens = (id, ctx, rad) => {
    const len = ((A1 - A0) / 360) * 2 * Math.PI * rad;
    const sweep = r(Math.max(0.3, 0.7 * ctx.L));
    return [
      `tl.fromTo(".${id}-dial",{opacity:0,scale:0.86},{opacity:1,scale:1,duration:${ctx.du(0.5)},ease:"back.out(1.8)",transformOrigin:"50% 50%"},${ctx.at(0.2)});`,
      `tl.fromTo(".${id}-arc",{strokeDashoffset:${r(len)}},{strokeDashoffset:0,duration:${sweep},ease:"power3.out"},${r(ctx.T + 0.3 * ctx.L)});`,
      `tl.fromTo(".${id}-nd",{rotation:${A0}},{rotation:${A1},duration:${sweep},ease:"power3.out",transformOrigin:"0px 0px"},${r(ctx.T + 0.3 * ctx.L)});`,
      `tl.fromTo(".${id}-nj",{rotation:-3},{rotation:3,duration:1.57,ease:"sine.inOut",transformOrigin:"0px 0px",repeat:${K.reps(Math.max(0.4, ctx.L), 1.57)},yoyo:true},${r(ctx.T)});`,
    ];
  };

  // ── the two product mounts ──────────────────────────────────────────────────
  // EVERY PICTURE IN THIS FILM RIDES A DEVICE. The reference has exactly two frames — a browser
  // DeviceCard (18px radius, a 44px #F4F7FB title bar with three 12px traffic lights and a DM Mono
  // url pill) and a Phone (44px radius, 12px ink bezel, 90x22 notch). The earlier port replaced
  // both with one generic rounded panel with an inset light-catch, so a screenshot read as a
  // floating tile rather than as a product surface, and the film's address — printed only in the
  // url pill — vanished from the middle of the film entirely.
  //
  // FIRST LAW: no picture, no container. Both helpers return "" rather than an empty frame.
  function deviceCard(th, { cls, x, y, w, h, shot, url, z = 4 }) {
    if (!shot) return "";
    return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(U(CARD.radius))}cqw;overflow:hidden;background:${th.panel};border:1px solid ${rgba(th.ink, 0.12)};box-shadow:0 ${r(U(40))}cqw ${r(U(90))}cqw ${rgba(th.ink, 0.28)};display:flex;flex-direction:column;opacity:0;">
      <div style="height:${r(U(CARD.bar))}cqw;flex-shrink:0;background:${BAR};border-bottom:1px solid ${rgba(th.ink, 0.08)};display:flex;align-items:center;gap:${r(U(CARD.gap))}cqw;padding:0 ${r(U(CARD.padX))}cqw;">
        ${LAMPS.map((c) => `<span style="width:${r(U(CARD.lamp))}cqw;height:${r(U(CARD.lamp))}cqw;border-radius:50%;background:${c};flex:0 0 auto;"></span>`).join("")}
        <span style="margin-left:${r(U(12))}cqw;flex:1 1 auto;max-width:${r(U(CARD.pillMax))}cqw;height:${r(U(CARD.pill))}cqw;border-radius:${r(U(CARD.pillR))}cqw;background:${rgba(th.ink, 0.06)};display:flex;align-items:center;padding:0 ${r(U(12))}cqw;font-family:${th.monoStack};font-size:${r(U(CARD.font))}cqw;color:${rgba(th.ink, 0.5)};white-space:nowrap;overflow:hidden;">${esc(url || "")}</span>
      </div>
      <div style="position:relative;flex:1 1 auto;min-height:0;">${K.shotFill(shot, { bg: th.panel, w, h: h - U(CARD.bar) })}</div>
    </div>`;
  }
  function phoneFrame(th, { cls, x, y, w, h, shot, z = 4 }) {
    if (!shot) return "";
    return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(U(PHONE.radius))}cqw;padding:${r(U(PHONE.pad))}cqw;background:${th.ink};box-shadow:0 ${r(U(40))}cqw ${r(U(90))}cqw ${rgba(th.ink, 0.3)};opacity:0;">
      <div style="position:absolute;top:${r(U(PHONE.notchTop))}cqw;left:50%;transform:translateX(-50%);width:${r(U(PHONE.notchW))}cqw;height:${r(U(PHONE.notchH))}cqw;border-radius:${r(U(PHONE.notchH))}cqw;background:${th.ink};z-index:2;"></div>
      <div style="position:relative;width:100%;height:100%;border-radius:${r(U(PHONE.inner))}cqw;overflow:hidden;background:${th.panel};">${K.shotFill(shot, { bg: th.panel, w, h })}</div>
    </div>`;
  }
  const mount = (th, o) => (o.kind === "phone" ? phoneFrame(th, o) : deviceCard(th, o));

  // ── small type furniture ────────────────────────────────────────────────────
  // The Gate tagline is a SOLID ACCENT BAR, not a pill (flight-film.jsx:197) — a square-cut strip
  // of livery under the brand word.
  const taglineBar = (th, text) => `<span style="display:inline-block;padding:${r(U(T.tagPadY))}cqw ${r(U(T.tagPadX))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.monoStack};font-size:${r(U(T.tagSize))}cqw;letter-spacing:${T.tagTrack};text-transform:uppercase;white-space:nowrap;">${esc(text)}</span>`;
  // The Takeoff eyebrow IS a pill (flight-film.jsx:223).
  const browPill = (th, text) => `<span style="display:inline-block;padding:${r(U(T.tagPadY))}cqw ${r(U(T.tagPadX))}cqw;border-radius:${r(U(999))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.monoStack};font-size:${r(U(T.toBrow))}cqw;letter-spacing:0.14em;text-transform:uppercase;white-space:nowrap;">${esc(text)}</span>`;
  // CHIP (flight-film.jsx:138-140): a paper pill with an 8px accent dot.
  const chip = (th, cls, text) => `<span class="${cls}" style="display:inline-flex;align-items:center;gap:${r(U(portrait ? 12 : 8))}cqw;padding:${r(U(T.chipPadY))}cqw ${r(U(T.chipPadX))}cqw;border-radius:${r(U(999))}cqw;background:${th.panel};border:1px solid ${rgba(th.ink, 0.14)};box-shadow:0 ${r(U(portrait ? 8 : 6))}cqw ${r(U(portrait ? 20 : 18))}cqw ${rgba(th.ink, 0.1)};font-family:${th.displayStack};font-weight:700;font-size:${r(U(T.chipSize))}cqw;color:${th.ink};white-space:nowrap;opacity:0;"><span style="width:${r(U(T.chipDot))}cqw;height:${r(U(T.chipDot))}cqw;border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>${esc(text)}</span>`;

  const lines = (ls) => ls.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("");

  return {
    U, portrait, SW, SH, W, M, COL, T, TILES, CAP_TOP,
    sky, skyTweens, marksTween, planeAt, speedAt, gauge, gaugeTweens,
    mount, taglineBar, browPill, chip, lines,
  };
}

// ---- scene builders (closed over the stage) ----------------------------------
function makeBuilders(stage) {
  const KIT = makeKit(stage);
  const {
    U, portrait, W, M, COL, T, TILES, CAP_TOP,
    sky, skyTweens, marksTween, planeAt, speedAt, gauge, gaugeTweens,
    mount, taglineBar, browPill, chip, lines,
  } = KIT;

  // The pictureless fallback keeps the pack's ground AND its drifting cloud — an unanimated sky
  // behind a statement beat reads as a still, not as a design.
  const asStatement = (scene, ctx, opts) => {
    const st = K.statement(scene, ctx, opts);
    return { ...st, backdrop: sky(ctx.id, ctx.th), s: [...st.s, ...skyTweens(ctx.id, ctx)] };
  };

  // ═══ GATE — the brand lockup on the apron ═══════════════════════════════════
  // Reference: flight-film.jsx:184-202 / flightvert-film.jsx:126-141. A CENTRED lockup — the brand
  // word at 190px (210 in portrait), an accent-filled mono tagline bar beneath it, and a lead
  // paragraph — over the runway, with the jet taxiing left to right. THE TYPE OWNS THIS FRAME: the
  // opener is the loudest type in the film and the frame the thumbnail is cut from. The earlier
  // port set it as a left-aligned title card capped at U(96) — barely half the authored ceiling —
  // with a picture window filling the space the lockup should have had. The 16:9 cut still carries
  // one card, but out on the apron where it competes with nothing (see `shot` below).
  function sGate(scene, ctx, shots) {
    const { id, th, at, du } = ctx;
    const word = String(ctx.brand || ctx.title || "").trim();
    const size = K.fitOne(word, COL / K.camSafe(), U(T.gateWord), th.adv);
    const tagline = K.clampWords(String(scene.kicker || STRINGS.cleared), 34);
    // The reference prints ONE lead paragraph; our scene carries a headline AND a subtext, so both
    // are set as that paragraph rather than dropping either. The headline is a title, not a
    // sentence, so it gets its own full stop before the subtext runs on from it.
    const hl = String(scene.headline || "").trim();
    const lead = K.clampWords([hl && !/[.!?:]$/.test(hl) ? `${hl}.` : hl, scene.subtext].filter(Boolean).join(" "), 190);
    // LANDSCAPE ONLY, AND A DELIBERATE DIVERGENCE: flight-film.jsx's Gate is pictureless. The 16:9
    // cut takes one card here anyway because it is the only beat with genuine free frame — the
    // apron right of the taxiing jet, which never reaches x=1240 — and because a landscape deck
    // whose middle beats all read as figures would otherwise seat none of the user's assets.
    // Takeoff was tried first and rejected: the aircraft sweeps the diagonal (560,846)->(1240,326)
    // and cut straight through any card large enough to be worth showing.
    const shot = portrait ? null : (shots || [])[0] || null;
    const travel = 120 * ctx.L;
    const P = portrait
      ? { x: -240, y: 1516, s: 1.35, run: 780 }      // flightvert-film.jsx:130, 133
      : { x: -360, y: 846, s: 1.15, run: 1080 };     // flight-film.jsx:188, 193 (GROUND_Y-56)
    return {
      backdrop: sky(id, th, { ground: true, travel }),
      html: `
      ${planeAt(`${id}-plane`, th, { x: P.x, y: P.y, scale: P.s, gear: true })}
      ${shot ? mount(th, { cls: `${id}-card`, kind: "desktop", url: ctx.url, shot, x: U(1240), y: U(590), w: U(580), h: U(260) }) : ""}
      <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(T.gateTop))}cqw;text-align:center;z-index:6;">
        <div class="${id}-word" style="font-family:${th.displayStack};font-weight:800;font-size:${r(size)}cqw;line-height:${T.gateLh};letter-spacing:-0.03em;color:${th.ink};transform-origin:center center;opacity:0;">${esc(word)}</div>
        <div class="${id}-tag" style="margin-top:${r(U(portrait ? 18 : 6))}cqw;opacity:0;">${taglineBar(th, tagline)}</div>
        ${lead ? `<div class="${id}-lead" style="max-width:${r(U(T.leadMax))}cqw;margin:${r(U(26))}cqw auto 0;font-family:${th.displayStack};font-weight:600;font-size:${r(U(T.leadSize))}cqw;line-height:${T.leadLh};color:${rgba(th.ink, 0.72)};opacity:0;">${esc(lead)}</div>` : ""}
      </div>`,
      s: [
        // M.pop from 0.7 at progress 0.32, then the two rises the reference stages under it.
        `tl.fromTo(".${id}-word",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.7)},ease:"back.out(1.6)"},${at(0.5)});`,
        `tl.fromTo(".${id}-tag",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${du(0.45)},ease:"power3.out"},${at(0.95)});`,
        lead ? `tl.fromTo(".${id}-lead",{opacity:0,y:"${r(U(28))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(1.2)});` : "",
        shot ? `tl.fromTo(".${id}-card",{opacity:0,y:"${r(U(60))}cqw",scale:0.92},{opacity:1,y:0,scale:1,duration:${du(0.7)},ease:"back.out(1.3)"},${at(1.4)});` : "",
        `tl.fromTo(".${id}-plane",{x:0},{x:"${r(U(P.run))}cqw",duration:${r(Math.max(2.4, ctx.L))},ease:"power2.out"},${at(0.15)});`,
        marksTween(id, ctx, travel, "none"),
        ...skyTweens(id, ctx),
      ].filter(Boolean),
    };
  }

  // ═══ TAKEOFF — the roll, the rotation, the climb-out ════════════════════════
  // Reference: flight-film.jsx:204-228 / flightvert-film.jsx:143-167. The title move of the whole
  // film, and the beat the pack is named for. The runway accelerates under the aircraft, the nose
  // comes up, the gear leaves the ground and the contrail starts.
  function sTakeoff(scene, ctx, shots) {
    const { id, th, at, du } = ctx;
    const head = K.fitLines(scene.headline || scene.title || "", (portrait ? COL : U(1000)) / K.camSafe(), U(T.toHead), 3, th.adv);
    const body = K.clampWords(String(scene.subtext || "").trim(), 170);
    // PORTRAIT ONLY. The vertical cut hangs a 780x380 card under the copy (flightvert-film.jsx:157)
    // and the aircraft passes behind it exactly as it does there. In LANDSCAPE the reference gives
    // this beat no picture and there is nowhere to put one: the jet sweeps the diagonal
    // (560,846) -> (1240,326), straight through the middle of any card worth showing. The 16:9
    // cut's spare slot lives on Gate's apron instead.
    const shot = portrait ? (shots || [])[0] || null : null;
    // The mean of `900*(0.4+roll)` across the beat: 360px/s at brake release rising to 1260px/s at
    // rotation, so ~0.8 of the peak, delivered on an accelerating ease.
    const travel = 720 * ctx.L;
    const P = portrait
      ? { x: 180, y: 1516, s: 1.5, runX: 580, runY: -1120, pitch: 16 }   // flightvert-film.jsx:148-150
      : { x: 560, y: 846, s: 1.35, runX: 680, runY: -520, pitch: 13 };   // flight-film.jsx:209-211
    const copy = portrait
      ? `position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(260))}cqw;text-align:center;`
      : `position:absolute;left:${r(U(96))}cqw;top:${r(U(150))}cqw;width:${r(U(1000))}cqw;`;
    return {
      backdrop: sky(id, th, { ground: true, travel }),
      html: `
      ${speedAt(`${id}-speed`, th, { x: P.x, y: P.y })}
      ${planeAt(`${id}-plane`, th, { x: P.x, y: P.y, scale: P.s, gear: true, contrail: true })}
      ${shot ? mount(th, {
        cls: `${id}-card`, kind: "desktop", url: ctx.url, shot,
        // flightvert-film.jsx:157 — left/right 150, top 900, height 380.
        x: U(150), y: U(900), w: W - U(300), h: U(380),
      }) : ""}
      <div style="${copy}z-index:6;">
        <div class="${id}-brow" style="opacity:0;">${browPill(th, K.clampWords(String(scene.kicker || STRINGS.takeoff), 24))}</div>
        <div class="${id}-head" style="margin-top:${r(U(portrait ? 18 : 14))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:${T.toHeadLh};letter-spacing:-0.03em;color:${th.ink};opacity:0;">${lines(head.lines)}</div>
        ${body ? `<div class="${id}-body" style="margin:${r(U(22))}cqw ${portrait ? "auto" : "0"} 0;max-width:${r(U(T.toBodyMax))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(U(T.toBody))}cqw;line-height:1.5;color:${rgba(th.ink, 0.72)};opacity:0;">${esc(body)}</div>` : ""}
      </div>`,
      s: [
        `tl.fromTo(".${id}-brow",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"power3.out"},${at(0.06)});`,
        `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.12)});`,
        body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.34)});` : "",
        shot ? `tl.fromTo(".${id}-card",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(1.6)"},${at(0.55)});` : "",
        // Roll, then rotate and climb — the reference's two-phase move, on x then y+rotation so no
        // two tweens ever contend for one property.
        `tl.fromTo(".${id}-plane",{x:0},{x:"${r(U(P.runX))}cqw",duration:${r(Math.max(1, 0.9 * ctx.L))},ease:"sine.inOut"},${r(ctx.T + 0.05 * ctx.L)});`,
        `tl.fromTo(".${id}-plane",{y:0,rotation:0},{y:"${r(U(P.runY))}cqw",rotation:${-P.pitch},duration:${r(Math.max(0.6, 0.45 * ctx.L))},ease:"power2.out"},${r(ctx.T + 0.5 * ctx.L)});`,
        // The streaks stay PINNED TO THE NOSE — the reference recomputes them from the aircraft's
        // own position every frame, so they get the identical x tween (same start, same ease, same
        // distance) rather than sitting where the jet used to be. They belong to the ROLL: they
        // appear with the acceleration and are gone once the wheels leave the ground, which is what
        // sells the rotation as a moment rather than a pan.
        `tl.fromTo(".${id}-speed",{x:0},{x:"${r(U(P.runX))}cqw",duration:${r(Math.max(1, 0.9 * ctx.L))},ease:"sine.inOut"},${r(ctx.T + 0.05 * ctx.L)});`,
        `tl.fromTo(".${id}-speed",{opacity:0},{opacity:1,duration:${du(0.2)},ease:"power2.out"},${at(0.12)});`,
        // Gone BEFORE the nose comes up (0.5 of the beat), not after: the fan tracks the aircraft
        // in x only, so once it starts climbing the streaks would be left at runway level.
        `tl.to(".${id}-speed",{opacity:0,duration:${r(Math.max(0.2, 0.12 * ctx.L))},ease:"power2.in"},${r(ctx.T + 0.38 * ctx.L)});`,
        // The contrail starts as the aircraft rotates, not on the roll.
        `tl.fromTo("#${id} .${id}-plane-p-trail",{opacity:0,scaleX:0.2},{opacity:0.7,scaleX:1,duration:${du(0.5)},ease:"power2.out",transformOrigin:"100% 50%"},${r(ctx.T + 0.5 * ctx.L)});`,
        // The whole Runway group drops 120px as the nose comes up (flight-film.jsx:213, 218).
        // SVG group -> GSAP user units, which here ARE the reference's pixels.
        portrait ? "" : `tl.fromTo(".${id}-rw",{y:0},{y:120,duration:${r(Math.max(0.6, 0.45 * ctx.L))},ease:"power2.out"},${r(ctx.T + 0.5 * ctx.L)});`,
        marksTween(id, ctx, travel, "power2.in"),
        ...skyTweens(id, ctx),
      ].filter(Boolean),
    };
  }

  // ═══ CLIMB — copy column beside the hero picture ════════════════════════════
  // Reference landscape (flight-film.jsx:231-251): a 620px left column at (110,230) carrying an
  // accent mono eyebrow, an 84px headline, a 25/1.55 paragraph and a row of three chips, with the
  // DeviceCard occupying the right at (1114,300) and flying in LATERALLY from off-frame.
  // Reference portrait (flightvert-film.jsx:169-186): the same beat centred, with the picture on a
  // PHONE beneath it. The earlier port printed ONE word truncated at 30 characters over a generic
  // panel, in both aspects.
  function sClimb(scene, ctx, shots) {
    const { id, th, at, du } = ctx;
    const shot = (shots || [])[0] || null;
    if (!shot) return asStatement(scene, ctx, { centred: true });   // SECOND LAW
    const chips = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 18)).filter(Boolean);
    const brow = K.clampWords(String(scene.kicker || STRINGS.climb).toUpperCase(), 28);
    const colW = portrait ? COL : U(620);
    const head = K.fitLines(scene.headline || scene.title || "", colW / K.camSafe(), U(T.clHead), 3, th.adv);
    const body = portrait ? "" : K.clampWords(String(scene.subtext || "").trim(), 190);

    // PORTRAIT: the phone is 480x1000 at (300,760) in the reference — which runs to y=1760, under
    // our caption pill. The height is clamped to the reserve instead of the picture being moved.
    const box = portrait
      ? { x: U(300), y: U(760), w: U(480), h: Math.min(U(1000), CAP_TOP - U(760) - U(24)), kind: "phone" }
      : { x: W - U(150) - U(656), y: U(300), w: U(656), h: U(400), kind: "desktop" };

    // THE CLIMB PATH IS ASPECT-AWARE. In landscape the reference holds the aircraft at (430,640)
    // with only its bob, clear of the card on the right, and the card supplies the movement. In
    // PORTRAIT the card is centred and nearly frame-wide, so the same treatment would put the
    // aircraft behind it; it therefore crosses the clear band ABOVE the card (the reference's own
    // y=520) as a lateral pass with an 8-degree pitch. Flying it OVER the card was rejected: an
    // airliner across the customer's screenshot is worse than one flying past it.
    const P = portrait
      ? { x: -300, y: 520, s: 0.8, pitch: 8, run: 1680, lift: -60 }
      : { x: 430, y: 640, s: 0.95, pitch: 8, run: 0, lift: 0 };
    const bobY = r(U(16));   // sin(t*0.8)*8 -> amplitude 8, so a 16px yoyo
    return {
      backdrop: sky(id, th),
      html: `
      ${planeAt(`${id}-plane`, th, { x: P.x, y: P.y, scale: P.s, pitch: P.pitch, gear: false, contrail: true })}
      ${mount(th, { cls: `${id}-card`, ...box, shot, url: ctx.url })}
      <div class="${id}-copy" style="position:absolute;left:${r(M)}cqw;${portrait ? `right:${r(M)}cqw;text-align:center;` : `width:${r(colW)}cqw;`}top:${r(U(portrait ? 210 : 230))}cqw;z-index:6;opacity:0;">
        <div style="font-family:${th.monoStack};font-size:${r(U(T.clBrow))}cqw;letter-spacing:0.2em;color:${th.accent};margin-bottom:${r(U(14))}cqw;text-transform:uppercase;">${esc(brow)}</div>
        <div style="font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:${T.clHeadLh};letter-spacing:-0.02em;color:${th.ink};">${lines(head.lines)}</div>
        ${body ? `<div style="margin-top:${r(U(18))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(U(T.clBody))}cqw;line-height:${T.clBodyLh};color:${rgba(th.ink, 0.72)};">${esc(body)}</div>` : ""}
        ${chips.length ? `<div style="margin-top:${r(U(24))}cqw;display:flex;gap:${r(U(portrait ? 16 : 12))}cqw;flex-wrap:wrap;${portrait ? "justify-content:center;" : ""}">${chips.map((c, i) => chip(th, `${id}-chip`, c)).join("")}</div>` : ""}
      </div>`,
      s: [
        `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
        chips.length ? `tl.fromTo("#${id} .${id}-chip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.3)},ease:"back.out(1.8)",stagger:${du(0.15)}},${r(ctx.T + 0.5 * ctx.L)});` : "",
        // The card arrives LATERALLY, matching the aircraft's own direction of travel: translateX
        // (1-t)*700 from the right on easeOutBack across progress 0.12 -> 0.46 (flight-film.jsx:246).
        // The earlier port normalised this into the kit's default rise, which broke the one visual
        // rhyme the beat had.
        `tl.fromTo(".${id}-card",{opacity:0,x:"${r(U(700))}cqw"},{opacity:1,x:0,duration:${r(Math.max(0.6, 0.34 * ctx.L))},ease:"back.out(1.2)"},${r(ctx.T + 0.12 * ctx.L)});`,
        // sin(t*0.8)*8 on BOTH the card and the aircraft — period 7.85s, half-cycle 3.93s. Nothing
        // in the air is ever perfectly still, and the port had no bob anywhere.
        `tl.to(".${id}-card",{y:"+=${bobY}cqw",duration:3.93,ease:"sine.inOut",repeat:${K.reps(Math.max(0.4, ctx.L - 0.5), 3.93)},yoyo:true},${r(ctx.T + 0.5)});`,
        P.run
          ? `tl.fromTo(".${id}-plane",{x:0,y:0},{x:"${r(U(P.run))}cqw",y:"${r(U(P.lift))}cqw",duration:${r(Math.max(2.2, ctx.L * 0.95))},ease:"power1.inOut"},${at(0.2)});`
          : `tl.to(".${id}-plane",{y:"+=${bobY}cqw",duration:3.93,ease:"sine.inOut",repeat:${K.reps(Math.max(0.4, ctx.L), 3.93)},yoyo:true},${r(ctx.T)});`,
        ...skyTweens(id, ctx),
      ].filter(Boolean),
    };
  }

  // ═══ CRUISE — the cabin full of screens ════════════════════════════════════
  // Reference: flight-film.jsx:253-273 (five tiles, two rows, deliberately unequal widths, one of
  // them a PHONE) / flightvert-film.jsx:188-199 (three alternating full-bleed cards). The earlier
  // port normalised both into a row of at most three equal 1.23:1 boxes, which cropped 16:9
  // captures far harder than the authored tiles and read as a three-up card row.
  function sCruise(scene, ctx, shots) {
    const { id, th, at, du } = ctx;
    const pics = (shots || []).filter(Boolean);
    if (pics.length < 2) return asStatement(scene, ctx);            // SECOND LAW
    // Draw only as many tiles as there are pictures — never a mosaic with a hole in it. When the
    // landscape film has fewer than four, only the reference's TOP row survives and the beat reads
    // top-heavy with a third of the frame empty below it, so the surviving row drops into the
    // vertical centre of the space the two rows would have shared.
    const tiles = TILES.slice(0, Math.min(TILES.length, pics.length));
    const drop = !portrait && tiles.length <= 3 ? 130 : 0;
    const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(T.crHead), 2, th.adv);
    const sub = portrait ? "" : K.clampWords(String(scene.subtext || "").trim(), 170);
    return {
      backdrop: sky(id, th),
      html: `
      <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(portrait ? 190 : 110))}cqw;text-align:center;z-index:6;opacity:0;">
        <div style="font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:1.02;letter-spacing:-0.02em;color:${th.ink};">${lines(head.lines)}</div>
        ${sub ? `<div style="max-width:${r(U(T.crSubMax))}cqw;margin:${r(U(12))}cqw auto 0;font-family:${th.displayStack};font-weight:600;font-size:${r(U(T.crSub))}cqw;line-height:1.5;color:${rgba(th.ink, 0.7)};">${esc(sub)}</div>` : ""}
      </div>
      ${tiles.map((t, i) => mount(th, {
        cls: `${id}-t${i}`, kind: t.kind, url: ctx.url, shot: pics[i],
        x: U(t.x), y: U(t.y + drop), w: U(t.w), h: Math.min(U(t.h), CAP_TOP - U(t.y + drop) - U(16)),
      })).join("")}`,
      s: [
        `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.4)},ease:"power3.out"},${at(0.15)});`,
        // Entry at progress 0.16 + 0.09i over 0.34 on easeOutBack, translateY 60 -> 0 and
        // scale 0.92 -> 1 (flight-film.jsx:266-267).
        ...tiles.map((t, i) =>
          `tl.fromTo(".${id}-t${i}",{opacity:0,y:"${r(U(60))}cqw",scale:0.92},{opacity:1,y:0,scale:1,duration:${r(Math.max(0.5, 0.34 * ctx.L))},ease:"back.out(1.4)"},${r(ctx.T + (0.16 + i * 0.09) * ctx.L)});`),
        // sin(t*0.7+i)*8 — period 8.98s, half-cycle 4.49s, one radian of phase per tile.
        ...tiles.map((t, i) =>
          `tl.to(".${id}-t${i}",{y:"+=${r(U(16))}cqw",duration:4.49,ease:"sine.inOut",repeat:${K.reps(Math.max(0.4, ctx.L - i * 0.3 - 0.6), 4.49)},yoyo:true},${r(ctx.T + 0.6 + i * 0.3)});`),
        ...skyTweens(id, ctx),
      ],
    };
  }

  // ═══ INSTRUMENTS — the readouts ════════════════════════════════════════════
  // Reference landscape (flight-film.jsx:275-296): the ANALOGUE GAUGE at (1520,370) r160 with a
  // 0.5-scale airliner flying beneath it at (1520,780), the headline LEFT at (110,140) at 92px,
  // and three stat cards left-aligned at (110,560).
  // Reference portrait (flightvert-film.jsx:201-214): no dial — at 1080 wide the three full-width
  // readouts ARE the instrument panel — with the aircraft at (820,1400) at 0.55.
  //
  // The earlier port drew NEITHER the dial NOR the aircraft on this beat, and replaced the sky
  // with an 86%-scrimmed wash of a screenshot, deleting the pack's signature ground on the one
  // beat where a drifting cloud behind a gauge did most of its work.
  function sInstruments(scene, ctx, shots) {
    const { id, th, at, du } = ctx;
    const stats = K.numbersIn(scene, 3);
    if (stats.length < 2) return asStatement(scene, ctx, { centred: true });
    const shot = (shots || [])[0] || null;
    const head = K.fitLines(scene.headline || scene.title || "",
      (portrait ? COL : U(900)) / K.camSafe(), U(T.inHead), 2, th.adv);
    const body = portrait ? "" : K.clampWords(String(scene.subtext || "").trim(), 170);

    if (portrait) {
      // Full-width rows: the numeral on the left at 130px, the mono label right-aligned opposite.
      const rowH = U(200), gap = U(32), top = U(640);
      const cardsEnd = top + stats.length * rowH + (stats.length - 1) * gap;
      // The picture takes the foot the reference leaves clear, clamped off the caption reserve;
      // with one aboard the aircraft moves up into the gap above the readouts instead.
      const picY = cardsEnd + U(40);
      const picH = Math.max(U(200), CAP_TOP - picY - U(20));
      const P = shot ? { x: 820, y: 560 } : { x: 820, y: 1400 };
      return {
        backdrop: sky(id, th),
        html: `
        ${planeAt(`${id}-plane`, th, { x: P.x, y: P.y, scale: 0.55, pitch: 8, gear: false, contrail: true })}
        <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(260))}cqw;text-align:center;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:${T.inHeadLh};letter-spacing:-0.03em;color:${th.ink};z-index:6;opacity:0;">${lines(head.lines)}</div>
        ${stats.map((st, i) => `<div class="${id}-c${i}" style="position:absolute;left:${r(U(80))}cqw;right:${r(U(80))}cqw;top:${r(top + i * (rowH + gap))}cqw;height:${r(rowH)}cqw;border-radius:${r(U(30))}cqw;background:${th.panel};border:1px solid ${rgba(th.ink, 0.12)};box-shadow:0 ${r(U(20))}cqw ${r(U(50))}cqw ${rgba(th.ink, 0.12)};padding:0 ${r(U(54))}cqw;display:flex;align-items:center;justify-content:space-between;gap:${r(U(24))}cqw;z-index:5;opacity:0;">
          <div style="font-family:${th.displayStack};font-weight:800;font-size:${r(U(T.inNum))}cqw;line-height:0.9;letter-spacing:-0.03em;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
          <div style="font-family:${th.monoStack};font-size:${r(U(T.inLabel))}cqw;letter-spacing:${T.inLabelTrack};color:${rgba(th.ink, 0.55)};text-align:right;max-width:${r(U(260))}cqw;">${esc(K.statLabel(scene, i))}</div>
        </div>`).join("")}
        ${shot ? mount(th, { cls: `${id}-card`, kind: "desktop", url: ctx.url, shot, x: U(80), y: picY, w: W - U(160), h: picH }) : ""}`,
        s: [
          `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.45)},ease:"power3.out"},${at(0.15)});`,
          ...statTweens(id, ctx, stats, 0.28),
          shot ? `tl.fromTo(".${id}-card",{opacity:0,y:"${r(U(50))}cqw"},{opacity:1,y:0,duration:${du(0.55)},ease:"power3.out"},${at(1.1)});` : "",
          ...skyTweens(id, ctx),
        ].filter(Boolean),
      };
    }

    // LANDSCAPE. Reference geometry when the beat is pictureless, which is how flight-film.jsx
    // draws it: gauge r160 at (1520,370), aircraft under it at (1520,780), headline and a
    // three-card stat ROW down the left margin.
    //
    // When a picture DOES land here the whole right half is given to the DeviceCard, the gauge
    // shrinks into the corner above it and the stat cards become a left-hand COLUMN — the same
    // reading as the vertical cut. Every element the reference authors is still on screen; only
    // the arrangement yields, and it yields only on the beats that received an asset.
    const P = shot ? { x: 1350, y: 860, s: 0.45 } : { x: 1520, y: 780, s: 0.5 };
    const dial = shot ? { cx: 1615, cy: 230, rad: 110 } : { cx: 1520, cy: 370, rad: 160 };
    const headW = shot ? U(700) : U(900);
    const statTop = shot ? U(380) : U(560);
    const rowH = U(130), rowGap = U(22);
    return {
      backdrop: sky(id, th),
      html: `
      ${planeAt(`${id}-plane`, th, { x: P.x, y: P.y, scale: P.s, pitch: 6, gear: false, contrail: true })}
      <svg viewBox="0 0 ${KIT.SW} ${KIT.SH}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;">
        ${gauge(id, th, dial)}
      </svg>
      ${shot ? mount(th, { cls: `${id}-card`, kind: "desktop", url: ctx.url, shot, x: U(860), y: U(380), w: U(960), h: U(400) }) : ""}
      <div class="${id}-head" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(shot ? 130 : 140))}cqw;width:${r(headW)}cqw;z-index:6;opacity:0;">
        <div style="font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:${T.inHeadLh};letter-spacing:-0.02em;color:${th.ink};">${lines(head.lines)}</div>
        ${body && !shot ? `<div style="margin-top:${r(U(18))}cqw;max-width:${r(U(T.inBodyMax))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(U(T.inBody))}cqw;line-height:1.5;color:${rgba(th.ink, 0.72)};">${esc(body)}</div>` : ""}
      </div>
      ${shot
        ? stats.map((st, i) => `<div class="${id}-c${i}" style="position:absolute;left:${r(U(110))}cqw;top:${r(statTop + i * (rowH + rowGap))}cqw;width:${r(U(700))}cqw;height:${r(rowH)}cqw;border-radius:${r(U(22))}cqw;background:${th.panel};border:1px solid ${rgba(th.ink, 0.12)};box-shadow:0 ${r(U(20))}cqw ${r(U(50))}cqw ${rgba(th.ink, 0.12)};padding:0 ${r(U(38))}cqw;display:flex;align-items:center;justify-content:space-between;gap:${r(U(20))}cqw;z-index:5;opacity:0;">
            <div style="font-family:${th.displayStack};font-weight:800;font-size:${r(U(T.inNum))}cqw;line-height:1;letter-spacing:-0.03em;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
            <div style="font-family:${th.monoStack};font-size:${r(U(T.inLabel))}cqw;letter-spacing:${T.inLabelTrack};color:${rgba(th.ink, 0.55)};text-align:right;white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
          </div>`).join("")
        : `<div style="position:absolute;left:${r(U(110))}cqw;top:${r(statTop)}cqw;display:flex;gap:${r(U(30))}cqw;z-index:5;">
            ${stats.map((st, i) => `<div class="${id}-c${i}" style="background:${th.panel};border:1px solid ${rgba(th.ink, 0.12)};border-radius:${r(U(22))}cqw;box-shadow:0 ${r(U(20))}cqw ${r(U(50))}cqw ${rgba(th.ink, 0.12)};padding:${r(U(30))}cqw ${r(U(42))}cqw;min-width:${r(U(300))}cqw;opacity:0;">
              <div style="font-family:${th.displayStack};font-weight:800;font-size:${r(U(T.inNum))}cqw;line-height:1;letter-spacing:-0.03em;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
              <div style="font-family:${th.monoStack};font-size:${r(U(T.inLabel))}cqw;letter-spacing:${T.inLabelTrack};color:${rgba(th.ink, 0.55)};margin-top:${r(U(8))}cqw;white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
            </div>`).join("")}
          </div>`}`,
      s: [
        `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${du(0.45)},ease:"power3.out"},${at(0.1)});`,
        shot ? `tl.fromTo(".${id}-card",{opacity:0,x:"${r(U(180))}cqw"},{opacity:1,x:0,duration:${du(0.6)},ease:"power3.out"},${at(0.3)});` : "",
        ...statTweens(id, ctx, stats, 0.34),
        ...gaugeTweens(id, ctx, dial.rad),
        ...skyTweens(id, ctx),
      ].filter(Boolean),
    };
  }

  // The reference's Counter: an easeOutExpo ramp from zero, one card at a time.
  function statTweens(id, ctx, stats, at0) {
    const { at, du } = ctx;
    return stats.flatMap((st, i) => {
      const num = Number(String(st.v).replace(/,/g, "")) || 0;
      const dp = String(st.v).includes(".") ? 1 : 0;
      return [
        `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.44)},ease:"back.out(2)"},${at(at0 + i * 0.12)});`,
        `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.7)},ease:"expo.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(at0 + 0.04 + i * 0.12)});`,
      ];
    });
  }

  // ═══ ARRIVAL — the close ═══════════════════════════════════════════════════
  // Reference landscape (flight-film.jsx:298-318): LEFT-aligned at (110,250) in a 1040px column —
  // logo plate, 132px headline, a 780px paragraph, then the CTA pill and the url on one baseline,
  // with the jet crossing the sky at y=330. Reference portrait (flightvert-film.jsx:216-233):
  // centred from top 720, with a full-width 50px CTA. The earlier port centred BOTH (against its
  // own manifest, which declares `textfx.align: "left"`) and dropped the paragraph entirely.
  function sArrival(scene, ctx, logo) {
    const { id, th, at, du } = ctx;
    const colW = portrait ? COL : U(1040);
    const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, colW / K.camSafe(), U(T.arHead), 3, th.adv);
    const body = K.clampWords(String(scene.subtext || "").trim(), 170);
    const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
    const hasMark = !!(logo && logo.path);
    const plate = portrait ? 190 : 118, plateR = portrait ? 44 : 24, platePad = portrait ? 24 : 15;
    const P = portrait
      ? { x: -300, y: 430, s: 0.8, run: 1600 }
      : { x: -300, y: 330, s: 0.9, run: 1740 };
    return {
      backdrop: sky(id, th),
      html: `
      ${planeAt(`${id}-plane`, th, { x: P.x, y: P.y, scale: P.s, pitch: -4, gear: false, contrail: true })}
      <div style="position:absolute;left:${r(portrait ? M : U(110))}cqw;${portrait ? `right:${r(M)}cqw;` : `width:${r(colW)}cqw;`}top:${r(U(portrait ? 720 : 250))}cqw;z-index:6;${portrait ? "display:flex;flex-direction:column;align-items:center;text-align:center;" : ""}">
        ${hasMark ? `<div class="${id}-logo" style="width:${r(U(plate))}cqw;height:${r(U(plate))}cqw;border-radius:${r(U(plateR))}cqw;background:${th.panel};border:1px solid ${rgba(th.ink, 0.12)};box-shadow:0 ${r(U(20))}cqw ${r(U(50))}cqw ${rgba(th.ink, 0.12)};overflow:hidden;padding:${r(U(platePad))}cqw;margin-bottom:${r(U(portrait ? 48 : 22))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
        <div class="${id}-head" style="font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:${T.arHeadLh};letter-spacing:-0.03em;color:${th.ink};opacity:0;">${lines(head.lines)}</div>
        ${body ? `<div class="${id}-body" style="margin-top:${r(U(22))}cqw;max-width:${r(U(T.arBodyMax))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(U(T.arBody))}cqw;line-height:1.5;color:${rgba(th.ink, 0.72)};opacity:0;">${esc(body)}</div>` : ""}
        <div class="${id}-pill" style="margin-top:${r(U(portrait ? 46 : 32))}cqw;display:flex;align-items:center;gap:${r(U(20))}cqw;${portrait ? "flex-direction:column;width:100%;" : ""}opacity:0;">
          <span style="display:inline-flex;align-items:center;justify-content:center;gap:${r(U(14))}cqw;${portrait ? "width:100%;" : ""}padding:${r(U(portrait ? 34 : 20))}cqw ${r(U(44))}cqw;border-radius:${r(U(999))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.displayStack};font-weight:800;font-size:${r(K.fitOne(action, U(portrait ? 760 : 600), U(T.arCta), th.adv))}cqw;text-transform:uppercase;white-space:nowrap;box-shadow:0 ${r(U(16))}cqw ${r(U(40))}cqw ${rgba(th.accent, 0.4)};">${esc(action)} <span style="font-size:${r(U(T.arGlyph))}cqw;">&#9992;</span></span>
          <span style="font-family:${th.monoStack};font-size:${r(U(T.arUrl))}cqw;letter-spacing:0.1em;color:${rgba(th.ink, 0.65)};white-space:nowrap;">${esc(ctx.url)}</span>
        </div>
      </div>`,
      s: [
        hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(1.8)"},${at(0.35)});` : "",
        `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(44))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(0.6)});`,
        body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(28))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(1.0)});` : "",
        `tl.fromTo(".${id}-pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2)"},${at(1.35)});`,
        `tl.fromTo(".${id}-plane",{x:0},{x:"${r(U(P.run))}cqw",duration:${r(Math.max(2.6, ctx.L))},ease:"power2.out"},${at(0.15)});`,
        ...skyTweens(id, ctx),
      ].filter(Boolean),
    };
  }

  return {
    gate: sGate, takeoff: sTakeoff, climb: sClimb, cruise: sCruise,
    instruments: sInstruments, arrival: sArrival,
    statement: (sc, ctx) => asStatement(sc, ctx),
    "statement-c": (sc, ctx) => asStatement(sc, ctx, { centred: true }),
  };
}

// ---- the spine ---------------------------------------------------------------
// MEDIA LIVES WHERE THE REFERENCE PUTS IT, AND THE REFERENCE PUTS IT SOMEWHERE DIFFERENT IN EACH
// ASPECT — so the spec is built against the stage, not shared across both.
//
//   CLIMB takes the reference's hero mount: a 656x400 DeviceCard in landscape, a 480x920 PHONE in
//   portrait. CRUISE takes the mosaic — five tiles in landscape, three in portrait.
//   ONE SPARE SLOT PER ASPECT, on the beat that has room for it: GATE's apron in landscape,
//   TAKEOFF's under-copy card in portrait (which the vertical reference itself authors). Plus one
//   on INSTRUMENTS, whose layout re-arranges around a picture. Those are divergences from
//   flight-film.jsx, argued at each layout, and they exist because `carry` sends every figures
//   beat to `instruments`: on a deck whose middles all read that way the film would otherwise seat
//   NONE of the user's assets, and scripts/test-portrait-assets.js requires them to reach three
//   scenes on a five-scene deck.
//
// A FIGURES BEAT, NOT A SENTENCE THAT HAPPENS TO CONTAIN NUMBERS. `K.numbersIn` reads the headline
// AND the subtext, so a feature beat whose supporting line mentions "2.4M trips a day across 120
// cities" counted as two figures and every picture-carrying role declined it. On a deck whose
// scenes share one supporting line that is EVERY middle beat: the film collapsed to a single
// layout repeated four times and seated none of the pictures. A beat is a stat beat when the
// figures are its own SUBJECT — its kind/purpose says so, or the figures are in the headline or
// the emphasis rather than buried in a supporting sentence.
const STAT_KIND = /stat|proof|result|metric|number|data|impact/i;
function isFiguresBeat(scene) {
  if (K.numbersIn(scene).length < 2) return false;
  if (STAT_KIND.test(String(scene.kind || "")) || STAT_KIND.test(String(scene.purpose || ""))) return true;
  return K.numbersIn({ emphasis: scene.emphasis, headline: scene.headline }).length >= 2;
}

function makeSpec(stage) {
  const portrait = stage.portrait;
  return {
    first: "gate", last: "arrival",
    // THE REFERENCE ORDER IS Gate -> TAKEOFF -> Climb -> Cruise -> Instruments -> Arrival, and
    // `middle` is consumed by a rotating cursor from index 0 (om_port_kit.js:259-261). With
    // `takeoff` last, a five-beat film never took off at all.
    middle: ["takeoff", "climb", "cruise", "instruments"],
    shapes: {
      gate: portrait ? [] : [580 / 260],
      takeoff: portrait ? [780 / 380] : [],
      climb: portrait ? [480 / 920] : [656 / 400],
      cruise: portrait ? CRUISE_P.map((t) => t.w / t.h) : CRUISE_L.map((t) => t.w / t.h),
      instruments: portrait ? [920 / 340] : [960 / 400],
      arrival: [], statement: [], "statement-c": [],
    },
    slots: (role, budget) => {
      if (role === "climb") return 1;
      if (role === "gate") return portrait ? 0 : Math.min(1, Math.max(0, budget));
      if (role === "takeoff") return portrait ? Math.min(1, Math.max(0, budget)) : 0;
      if (role === "instruments") return Math.min(1, Math.max(0, budget));
      if (role === "cruise") return Math.min(portrait ? CRUISE_P.length : CRUISE_L.length, Math.max(0, budget));
      return 0;
    },
    needs: (role) => (role === "climb" ? 1 : role === "cruise" ? 2 : 0),
    carry: (role, scene, budget) => {
      // Roles are picked by a ROTATING cursor, not by priority. `instruments` is the only layout
      // that prints figures AS figures, so every other role declines a genuine figures beat.
      const isStats = isFiguresBeat(scene);
      if (role === "instruments") return isStats;
      if (isStats) return false;
      if (role === "climb") return budget >= 1;
      if (role === "takeoff") return K.wordsOf(scene.headline || scene.emphasis || "").length >= 2;
      if (role === "cruise") return budget >= 2;
      return true;
    },
  };
}

const LABELS = {
  gate: STRINGS.gate, takeoff: STRINGS.takeoff, climb: STRINGS.climb, cruise: STRINGS.cruise,
  instruments: STRINGS.instruments, arrival: STRINGS.go,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { box-shadow:0 ${r(stage.U(8))}cqw ${r(stage.U(24))}cqw ${rgba(th.ink, 0.16)}; }`);

// One builder per aspect. `buildFor(stage)` is what the two exported modules share.
function buildFor(stage, fallbackBrand) {
  return (opts = {}) => K.buildFilm({
    ...opts, stage, theme, STRINGS, spec: makeSpec(stage), builders: makeBuilders(stage), labels: LABELS,
    css, refBeat: 4.4, camera: { push: 130, scale: 1.03 },
    signature: "cinematic", fallbackBrand,
  });
}

const LANDSCAPE = K.stageOf(1920, 1080);
const PORTRAIT = K.stageOf(1080, 1920);

module.exports = { buildComposition: buildFor(LANDSCAPE, "SKYWARD"), STRINGS };
module.exports.vertical = { buildComposition: buildFor(PORTRAIT, "SKYWARD"), STRINGS };
module.exports.__test = {
  SPEC: makeSpec(LANDSCAPE), makeSpec, isFiguresBeat, theme, LANDSCAPE, PORTRAIT, makeBuilders, makeKit, buildFor,
  GEO_L, GEO_P, TYPE_L, TYPE_P, CRUISE_L, CRUISE_P,
};
