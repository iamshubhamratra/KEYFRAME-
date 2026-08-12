// ORBIT — a rocket-launch film. Native GSAP + DOM/SVG, built on om_port_kit.
//
// PROVENANCE. A SCENE-FOR-SCENE port of the Claude Design reference
// `templete-design/all-template-handoffs/Orbit/src/orbit-film.jsx` (1920x1080, 6 scenes,
// transition="cut"). Its layout, geometry, type scale, colour and cast are reproduced; none of
// its copy is.
//
// WHY THIS FILE WAS REWRITTEN (6 Aug 2026). The previous port opened by declaring itself
// "mission-control instrumentation rather than sci-fi chrome" — i.e. it reinterpreted the
// reference instead of porting it, and the result scored 40/100 against the reference frames.
// Everything that made the design recognisable was gone: the drawn ROCKET, the PLANETS, the
// rotating ORBIT RING and its satellite, the twin NEBULA washes, the 90-star field, the launch
// SMOKE, and the console titlebar. In their place sat hairline "instrument panels" the reference
// never draws, plus the shared kit HUD (scene counter + progress rule) it explicitly does not
// have. Display type was capped at 84px where the reference sets 220px — a 2.6x shortfall that
// alone changes what the frame is about.
//
// HOW THE GEOMETRY IS PORTED. The reference draws its whole cast inside an
// `<svg viewBox="0 0 1920 1080">`, so this file does too: every graphic keeps the reference's
// EXACT pixel coordinates with no unit conversion to get wrong. Only DOM text uses the kit's
// cqw scale (U), because only text has to reflow for AI-authored copy of unknown length.
//
// HOW CONTINUOUS MOTION IS PORTED. The reference is re-evaluated every frame and reads
// `Math.sin(clock * k)` straight into styles. KEYFRAME seeks ONE paused timeline, so each of
// those becomes a repeating yoyo tween tracing the same curve — same amplitude, same period:
//   star twinkle   sin(clock*2)    -> period 3.14s, opacity 0.3x..1x of each star's base
//   orbit ring     rotate(clock*8) -> 8 deg/sec, linear
//   rocket idle    sin(t*2)*4px    -> period 3.14s, +-4px
//   flame flicker  sin(clock*30)   -> period 0.21s, on the flame's length
//   console bob    sin(t*0.8)*10px -> period 7.85s, +-10px
//   tile bob       sin(t*0.7+i)*10 -> period 8.98s, +-10px, phase-staggered per tile
//
// FONT SUBSTITUTION: none. The reference's Space Grotesk + JetBrains Mono are both bundled.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

// The reference ThemeContext, verbatim.
const BG = "#060814", PANEL = "#0E1426", INK = "#EAF0FF", SUB = "#8A93B2", LINE = "#26304A";
const ACCENT = "#5B8CFF", FLAME = "#FF7A2C", GOLD = "#FFC24C";
const DISPLAY = "Space Grotesk", MONO = "JetBrains Mono";

const STRINGS = {
  countdown: "T-MINUS 10… 9… 8…", missionControl: "MISSION CONTROL", ignition: "IGNITION",
  missionLive: "MISSION LIVE", liftoff: "LIFTOFF", screenshot: "SCREENSHOT",
  telemetry: "TELEMETRY", go: "LAUNCH NOW",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: BG, isDark: true, packAccent: ACCENT });
  return {
    accent, bg: BG, panel: PANEL, ink: INK, sub: SUB, line: LINE,
    // FLAME AND GOLD ARE SEMANTIC, NOT DECORATIVE — they are the colour of burning fuel, the
    // same way terminal-departures' green means ON TIME. The Art Director's skin carries no
    // authority over a pack's semantic colours, so a rebranded film still launches on orange
    // fire. (The previous port derived these by rotating the accent 168 deg, which turned the
    // flame whatever hue the brand happened to be — a blue flame under a blue brand.)
    flame: FLAME, gold: GOLD,
    glow: rgba(accent, 0.5),
    adv: K.ADVANCE.mixed,
    capBg: PANEL, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO),
    resolvedBrand,
  };
}

// ═══════════════════════════ the cast (reference SVG, 1920x1080) ══════════════════════════

// STARFIELD — the reference's own generator, so the sky is the same sky: 90 stars at
// seed = i*41.7, x = seed*7 % 1920, y = seed*13 % 1080, r = 2.6 every 7th else 1.4, base
// opacity 0.9 every 5th else 0.5. Twinkle is `0.3 + 0.7*(sin(clock*2+i)*0.5+0.5)`, i.e. each
// star breathes between 0.3x and 1.0x of its base.
//
// The twinkle is carried by FOUR phase groups rather than 90 individual tweens: the reference's
// per-star phase offset (`+i`) means neighbours are already out of step, and four groups
// reproduces that read at 4 tweens instead of 90. Grouping by i%4 also interleaves them
// spatially, so no group forms a visible band.
const TWINKLE_GROUPS = 4;
const TWINKLE_PERIOD = 3.14;           // 2*pi / 2, the reference's sin(clock*2)
function starGroups() {
  const groups = Array.from({ length: TWINKLE_GROUPS }, () => []);
  for (let i = 0; i < 90; i++) {
    const seed = i * 41.7;
    groups[i % TWINKLE_GROUPS].push({
      x: Math.round((seed * 7) % 1920), y: Math.round((seed * 13) % 1080),
      r: i % 7 === 0 ? 2.6 : 1.4, o: i % 5 === 0 ? 0.9 : 0.5,
    });
  }
  return groups;
}
const STAR_GROUPS = starGroups();

// The persistent sky: ground, twin nebula washes, the star field, and the rotating orbit ring
// with its satellite. Drawn under EVERY scene — this is what frame-matches across the cuts.
function space(id, th, { drift = false } = {}) {
  const stars = STAR_GROUPS.map((g, gi) =>
    `<g class="${id}-tw${gi}" opacity="1">${g.map((s) =>
      `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="#fff" opacity="${s.o}"/>`).join("")}</g>`).join("");

  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;">
      <defs>
        <radialGradient id="${id}neb" cx="0.7" cy="0.3" r="0.7">
          <stop offset="0" stop-color="${rgba(th.accent, 0.22)}"/><stop offset="1" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
        <radialGradient id="${id}neb2" cx="0.2" cy="0.8" r="0.6">
          <stop offset="0" stop-color="${rgba(th.flame, 0.16)}"/><stop offset="1" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="1920" height="1080" fill="${th.bg}"/>
      <rect x="0" y="0" width="1920" height="1080" fill="url(#${id}neb)"/>
      <rect x="0" y="0" width="1920" height="1080" fill="url(#${id}neb2)"/>
      <g class="${id}-sky">${stars}</g>
      <!-- TWO NESTED GROUPS, NOT ONE. GSAP owns the transform attribute the moment it tweens
           rotation, and it REPLACES the whole property - so a single group carrying both
           translate(1560 250) and a GSAP rotation loses its translate and the ring flies to the
           top-left corner, mostly off-frame. (It did exactly that on the first build of this
           rebuild.) The outer group carries the position and is never animated; the inner one
           spins about its own local origin. -->
      <g transform="translate(1560 250)" opacity="0.5">
        <g class="${id}-ring">
          <ellipse rx="230" ry="70" fill="none" stroke="${rgba(th.accent, 0.5)}" stroke-width="2"/>
          <circle cx="230" cy="0" r="7" fill="${th.accent}"/>
        </g>
      </g>
    </svg>
  </div>`;
}
// The sky's own motion. `drift` is the reference's per-scene star pan — passed ONLY by Liftoff
// (`drift={lift*1200}`), so every other beat holds a still sky. The previous port drifted the
// stars on every scene, which read as the camera never settling.
function spaceTweens(id, ctx, { drift = false } = {}) {
  const out = [];
  for (let gi = 0; gi < TWINKLE_GROUPS; gi++) {
    // Phase-offset each group across the period so the sky never pulses in unison.
    const at = ctx.T + (TWINKLE_PERIOD / TWINKLE_GROUPS) * gi;
    out.push(`tl.fromTo(".${id}-tw${gi}",{opacity:1},{opacity:0.3,duration:${r(TWINKLE_PERIOD / 2)},ease:"sine.inOut",repeat:${K.reps(Math.max(0.4, ctx.L), TWINKLE_PERIOD / 2)},yoyo:true},${r(at)});`);
  }
  // rotate(clock*8): 8 degrees per second, linear, for as long as the beat lasts. The origin is
  // the inner group's OWN centre (the ellipse is drawn about 0,0), because the outer group
  // already carries the translate — see the comment on the markup.
  out.push(`tl.fromTo(".${id}-ring",{rotation:0},{rotation:${r(8 * ctx.L)},transformOrigin:"0px 0px",duration:${r(Math.max(0.4, ctx.L))},ease:"none"},${r(ctx.T)});`);
  if (drift) {
    out.push(`tl.fromTo(".${id}-sky",{x:0},{x:-360,duration:${r(Math.max(0.4, ctx.L))},ease:"power2.in"},${r(ctx.T)});`);
  }
  return out;
}

// PLANET — a shaded sphere. The reference builds it as a radialGradient circle offset to 35%/30%,
// which is what gives it a terminator rather than reading as a flat dot.
function planet(cx, cy, rad, c1, c2, key) {
  return `<svg viewBox="0 0 ${rad * 2} ${rad * 2}" style="position:absolute;left:${r(U(cx - rad))}cqw;top:${r(U(cy - rad))}cqw;width:${r(U(rad * 2))}cqw;height:${r(U(rad * 2))}cqw;pointer-events:none;">
    <defs><radialGradient id="pl${key}" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </radialGradient></defs>
    <circle cx="${rad}" cy="${rad}" r="${rad}" fill="url(#pl${key})"/>
  </svg>`;
}

// ROCKET — transcribed path for path from the reference. Body, shaded right half, two accent
// fins, the accent band, and the porthole (ground fill + accent ring + inner glass). The flame
// is a separate group so it can flicker, and is only emitted when the rocket is under thrust.
function rocket(id, th, { x, y, scale = 1, thrust = false }) {
  // THE FLAME PATH IS THE fl=0.85 CASE, NOT fl=0. The reference's plume length is
  // `210 + fl*120` where `fl = 0.7 + 0.3*sin(clock*30)` — so under thrust it swings between 294
  // and 330, never 210. Transcribing the literal `210` (as the first build of this rebuild did)
  // draws the flame at its unlit length: a 60px stub under a 1.5x rocket. The path is drawn at
  // the mid-swing value and the scaleY flicker below covers the 0.7..1.0 range.
  const flame = thrust ? `
    <g class="${id}-flame">
      <path d="M-26 130 Q 0 312 26 130 Q 12 221 0 226.5 Q -12 221 -26 130 Z" fill="${th.flame}"/>
      <path d="M-14 130 Q 0 248 14 130 Q 0 202.5 -14 130 Z" fill="${th.gold}"/>
    </g>` : "";
  return `<g class="${id}-rocket" transform="translate(${x} ${y}) scale(${scale})">
    ${flame}
    <path d="M0 -80 Q 34 -20 34 60 L 34 130 L -34 130 L -34 60 Q -34 -20 0 -80 Z" fill="#EEF2FA"/>
    <path d="M0 -80 Q 34 -20 34 60 L 34 130 L 0 130 Z" fill="#C6CFE0"/>
    <path d="M-34 70 L-70 140 L-34 120 Z" fill="${th.accent}"/>
    <path d="M34 70 L70 140 L34 120 Z" fill="${th.accent}"/>
    <rect x="-34" y="86" width="68" height="10" fill="${th.accent}"/>
    <circle cx="0" cy="20" r="18" fill="${th.bg}" stroke="${th.accent}" stroke-width="4"/>
    <circle cx="0" cy="20" r="9" fill="${rgba(th.accent, 0.6)}"/>
  </g>`;
}
// sin(clock*30) on the flame length: period 0.21s. Scaled from the tail so the nozzle stays put.
const flameTweens = (id, ctx) => [
  `tl.fromTo(".${id}-flame",{opacity:0,scaleY:0.2},{opacity:1,scaleY:1,duration:${ctx.du(0.4)},ease:"power2.out"},${ctx.at(0.1)});`,
  // fl swings 0.7..1.0, so the plume is 0.78x..1.0x of its drawn length. Scaled from the nozzle
  // (y=130 in rocket-local coordinates) so the flame lengthens downward and never detaches.
  `tl.to(".${id}-flame",{scaleY:0.78,duration:0.105,ease:"sine.inOut",transformOrigin:"0px 130px",repeat:${K.reps(Math.max(0.3, ctx.L - 0.4), 0.105)},yoyo:true},${ctx.at(0.5)});`,
];

// SMOKE — five expanding, fading billows at the pad. The reference grows each from a staggered
// start (`on*1.6 - i*0.14`) and fades it as it grows, so the cloud both spreads and thins.
function smoke(id, th, cx, cy) {
  return `<g class="${id}-smoke" opacity="0">${[0, 1, 2, 3, 4].map((i) =>
    `<circle class="${id}-sm${i}" cx="${cx + (i - 2) * 70}" cy="${Math.round(cy + Math.sin(i) * 20)}" r="${90 + i * 20}" fill="${rgba("#C6CFE0", 0.28)}" opacity="0" style="transform-box:fill-box;transform-origin:center;"/>`).join("")}</g>`;
}
// PROPORTIONAL, NOT ABSOLUTE. The kit's at()/du() are in seconds, which is right for an
// entrance (a 0.5s fade is 0.5s on any beat) but wrong for anything the reference expresses as a
// fraction of scene PROGRESS. The reference rolls the smoke from progress 0.16 to ~0.56 with a
// per-billow stagger, so these are computed off ctx.L.
const smokeTweens = (id, ctx) => [
  `tl.set(".${id}-smoke",{opacity:1},${r(ctx.T + 0.1 * ctx.L)});`,
  ...[0, 1, 2, 3, 4].map((i) =>
    `tl.fromTo(".${id}-sm${i}",{scale:0,opacity:0.5},{scale:1,opacity:0,duration:${r(0.4 * ctx.L)},ease:"power2.out"},${r(ctx.T + (0.16 + i * 0.06) * ctx.L)});`),
];

// CONSOLE — the reference's media frame: rounded, panel-filled, accent-bordered, double
// shadowed (an accent bloom plus a deep drop), with a titlebar carrying three status lamps and
// the url. The previous port replaced this with a square hairline box and corner ticks.
// `url` is passed explicitly rather than read off the theme: buildFilm calls theme(brandSkin)
// with a single argument and BEFORE it resolves the film's url, so any attempt to thread it
// through the theme silently yields an empty titlebar.
function consoleFrame(th, inner, { radius = 16, url = "" } = {}) {
  const lamp = (c) => `<span style="width:${r(U(11))}cqw;height:${r(U(11))}cqw;border-radius:50%;background:${c};flex:0 0 auto;"></span>`;
  return `<div style="width:100%;height:100%;border-radius:${r(U(radius))}cqw;overflow:hidden;background:${th.panel};border:1px solid ${rgba(th.accent, 0.4)};box-shadow:0 0 ${r(U(60))}cqw ${rgba(th.accent, 0.22)}, 0 ${r(U(40))}cqw ${r(U(80))}cqw rgba(0,0,0,0.5);display:flex;flex-direction:column;">
    <div style="height:${r(U(44))}cqw;flex-shrink:0;background:#0A1020;border-bottom:1px solid ${rgba(th.accent, 0.3)};display:flex;align-items:center;gap:${r(U(8))}cqw;padding:0 ${r(U(16))}cqw;">
      ${lamp(th.flame)}${lamp(th.gold)}${lamp(th.accent)}
      <span style="margin-left:${r(U(10))}cqw;font-family:${th.monoStack};font-size:${r(U(12))}cqw;color:${rgba(th.ink, 0.5)};white-space:nowrap;overflow:hidden;">${esc(url)}</span>
    </div>
    <div style="flex:1;min-height:0;position:relative;">${inner}</div>
  </div>`;
}

// CHIP — a pill with a GLOWING status dot. The glow is the detail that makes it read as a
// telemetry light rather than a bullet point.
const chip = (th, text) =>
  `<span class="ochip" style="display:inline-flex;align-items:center;gap:${r(U(8))}cqw;padding:${r(U(9))}cqw ${r(U(18))}cqw;border-radius:${r(U(999))}cqw;background:${rgba(th.accent, 0.1)};border:1px solid ${rgba(th.accent, 0.5)};font-family:${th.monoStack};font-size:${r(U(15))}cqw;color:${th.ink};white-space:nowrap;opacity:0;"><span style="width:${r(U(7))}cqw;height:${r(U(7))}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${r(U(8))}cqw ${th.accent};flex:0 0 auto;"></span>${esc(text)}</span>`;

// CHROME — brand lockup with a glowing accent dot, and a BLINKING flame lamp beside
// "MISSION LIVE". That is the reference's entire persistent chrome: no scene counter, no
// progress rule. Returning it from every builder replaces the shared kit HUD.
function chrome(th, brand) {
  return `<div class="om-chrome">
    <div style="position:absolute;top:${r(U(44))}cqw;left:${r(U(60))}cqw;display:flex;align-items:center;gap:${r(U(13))}cqw;">
      <span style="width:${r(U(14))}cqw;height:${r(U(14))}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${r(U(14))}cqw ${th.accent};flex:0 0 auto;"></span>
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(26))}cqw;letter-spacing:0.1em;color:${th.ink};white-space:nowrap;">${esc(String(brand || "ORBIT").toUpperCase())}</span>
    </div>
    <div style="position:absolute;top:${r(U(50))}cqw;right:${r(U(60))}cqw;display:flex;align-items:center;gap:${r(U(10))}cqw;font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.18em;color:${rgba(th.ink, 0.6)};white-space:nowrap;">
      <span class="olive" style="width:${r(U(9))}cqw;height:${r(U(9))}cqw;border-radius:50%;background:${th.flame};flex:0 0 auto;"></span>${esc(STRINGS.missionLive)}
    </div>
  </div>`;
}
// `Math.floor(clock*2) % 2` — a hard 0.5s on/off blink, not a fade. steps(1) keeps it square.
const chromeBlink = (id, ctx) => [
  `tl.fromTo("#${id} .olive",{opacity:1},{opacity:0.3,duration:0.5,ease:"steps(1)",repeat:${K.reps(Math.max(0.5, ctx.L), 0.5)},yoyo:true},${r(ctx.T)});`,
];

const splitLines = (text, th, size, lh, tracking, color, shadow) =>
  `<div style="font-family:${th.displayStack};font-weight:700;font-size:${r(size)}cqw;line-height:${lh};letter-spacing:${tracking};color:${color};${shadow ? `text-shadow:0 0 ${r(U(60))}cqw ${shadow};` : ""}">${text}</div>`;

// ═══════════════════════════ scenes ═══════════════════════════

// COUNTDOWN — planet bottom-left, rocket idling at right, and the brand set at 220px.
// PICTURELESS BY DESIGN: the reference Countdown carries no media at all. The previous port
// required a screenshot here and filled 45% of the frame with it, which is why its opening
// frame looked nothing like the reference's.
function sCountdown(scene, ctx) {
  const { id, th, at, du } = ctx;
  const word = String(scene.headline || scene.emphasis || ctx.title || ctx.brand || "").trim();
  // 220px is the reference CEILING, not a constant: fitOne shrinks it for a long AI-authored
  // headline. Matching the ceiling is the point — the old port capped at 84px.
  const size = K.fitOne(word, U(1500), U(220), th.adv);
  const eyebrow = String(scene.kicker || STRINGS.countdown).slice(0, 40);
  const tagline = String(scene.subtext || scene.body || "").slice(0, 150);

  return {
    backdrop: space(id, th),
    chrome: chrome(th, ctx.brand),
    html: `
    ${planet(300, 880, 220, rgba(th.accent, 0.5), "#0A1430", `${id}a`)}
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;">
      ${rocket(id, th, { x: 1480, y: 560, scale: 1.4, thrust: false })}
    </svg>
    <div style="position:absolute;left:${r(U(96))}cqw;top:${r(U(300))}cqw;width:${r(U(1500))}cqw;">
      <div class="${id}-eb" style="font-family:${th.monoStack};font-size:${r(U(26))}cqw;letter-spacing:0.3em;color:${th.accent};opacity:0;">${esc(eyebrow)}</div>
      <div class="${id}-hd" style="margin-top:${r(U(14))}cqw;transform-origin:left center;opacity:0;">
        ${splitLines(esc(word), th, size, 0.86, "-0.03em", th.ink, th.glow)}
      </div>
      ${tagline ? `<div class="${id}-tg" style="margin-top:${r(U(20))}cqw;max-width:${r(U(720))}cqw;font-family:${th.displayStack};font-weight:500;font-size:${r(U(34))}cqw;line-height:1.4;color:${th.sub};opacity:0;">${esc(tagline)}</div>` : ""}
    </div>`,
    s: [
      `tl.fromTo(".${id}-eb",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.15)});`,
      // M.pop: scale 0.5 -> 1 on easeOutBack, from the left edge.
      `tl.fromTo(".${id}-hd",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.8)},ease:"back.out(1.6)"},${at(0.4)});`,
      tagline ? `tl.fromTo(".${id}-tg",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(1.0)});` : "",
      // sin(localTime*2)*4 — the rocket breathing on the pad.
      `tl.to(".${id}-rocket",{y:"-=4",duration:${r(TWINKLE_PERIOD / 2)},ease:"sine.inOut",repeat:${K.reps(Math.max(0.4, ctx.L), TWINKLE_PERIOD / 2)},yoyo:true},${r(ctx.T)});`,
      ...spaceTweens(id, ctx),
      ...chromeBlink(id, ctx),
    ].filter(Boolean),
  };
}

// LIFTOFF — the rocket climbs out of frame on a flickering flame column while smoke rolls
// across the pad and the sky pans. Pictureless in the reference.
function sLiftoff(scene, ctx) {
  const { id, th, at, du } = ctx;
  const head = String(scene.headline || scene.emphasis || "").trim();
  const size = K.fitOne(head, U(1600), U(150), th.adv);
  const pill = String(scene.kicker || STRINGS.ignition).slice(0, 28);

  return {
    backdrop: space(id, th, { drift: true }),
    chrome: chrome(th, ctx.brand),
    html: `
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;">
      ${smoke(id, th, 960, 900)}
      <g class="${id}-lift">${rocket(id, th, { x: 960, y: 720, scale: 1.5, thrust: true })}</g>
    </svg>
    <div style="position:absolute;left:0;right:0;top:${r(U(150))}cqw;text-align:center;">
      <div class="${id}-pill" style="display:inline-block;background:${th.flame};color:${K.inkOn(th.flame)};padding:${r(U(10))}cqw ${r(U(30))}cqw;border-radius:${r(U(999))}cqw;font-family:${th.monoStack};font-size:${r(U(22))}cqw;letter-spacing:0.16em;opacity:0;">${esc(pill)}</div>
      <div class="${id}-hd" style="margin-top:${r(U(16))}cqw;opacity:0;">
        ${splitLines(esc(head), th, size, 0.9, "-0.03em", th.ink, rgba(th.flame, 0.5))}
      </div>
    </div>`,
    s: [
      `tl.fromTo(".${id}-pill",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.15)});`,
      `tl.fromTo(".${id}-hd",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(0.3)});`,
      // lerp(720, -260, easeInCubic) across progress 0.2 -> 0.95 — the climb accelerates, it
      // does not coast, and it spans three quarters of the BEAT. Expressed in absolute seconds
      // (du(1.9) from T+0.2s) the rocket cleared the frame a third of the way in and the rest of
      // the beat played on an empty sky; the first build of this rebuild did exactly that.
      `tl.fromTo(".${id}-lift",{y:0},{y:-980,duration:${r(0.75 * ctx.L)},ease:"power3.in"},${r(ctx.T + 0.2 * ctx.L)});`,
      ...flameTweens(id, ctx),
      ...smokeTweens(id, ctx),
      ...spaceTweens(id, ctx, { drift: true }),
      ...chromeBlink(id, ctx),
    ],
  };
}

// FEATURE — copy left, a console floating on the right. The film's one copy-beside-device beat,
// and the only single-screenshot layout in the reference.
function sFeature(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx), backdrop: space(id, th), chrome: chrome(th, ctx.brand), s: [...(K.statement(scene, ctx).s || []), ...spaceTweens(id, ctx), ...chromeBlink(id, ctx)] };
  const head = K.fitLines(scene.headline || scene.title || "", U(640), U(92), 3, th.adv);
  const body = String(scene.subtext || "").trim().slice(0, 160);
  const chips = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 18));

  return {
    backdrop: space(id, th),
    chrome: chrome(th, ctx.brand),
    html: `
    <div class="${id}-copy" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(300))}cqw;width:${r(U(640))}cqw;z-index:6;opacity:0;">
      <div style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.2em;color:${th.accent};margin-bottom:${r(U(14))}cqw;text-transform:uppercase;">${esc(String(scene.kicker || STRINGS.missionControl).slice(0, 28))}</div>
      ${splitLines(head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join(""), th, head.size, 0.96, "0", th.ink, null)}
      ${body ? `<div style="margin-top:${r(U(22))}cqw;font-family:${th.displayStack};font-weight:400;font-size:${r(U(24))}cqw;line-height:1.5;color:${th.sub};max-width:${r(U(520))}cqw;">${esc(body)}</div>` : ""}
      ${chips.length ? `<div style="margin-top:${r(U(26))}cqw;display:flex;gap:${r(U(12))}cqw;flex-wrap:wrap;">${chips.map((c) => chip(th, c)).join("")}</div>` : ""}
    </div>
    <div class="${id}-con" style="position:absolute;right:${r(U(110))}cqw;top:${r(U(210))}cqw;width:${r(U(900))}cqw;height:${r(U(560))}cqw;opacity:0;">
      ${consoleFrame(th, K.shotFill(shot, { bg: th.panel }), { url: ctx.url })}
    </div>`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(0.25)});`,
      `tl.fromTo(".${id}-con",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.8)},ease:"back.out(1.7)"},${at(0.25)});`,
      // sin(t*0.8)*10 — zero-g float. Period 7.85s, so half-cycle 3.93s.
      // The `cqw` was missing here and on the Fleet tiles below: `y:"+=1.04"` is 1.04 PIXELS to
      // GSAP, not 1.04cqw (~20px at 1920), so the zero-g float ran at 1/19th of its amplitude and
      // the console sat still. Same three characters as deep_composer.js:301 — and this pack is the
      // one the fidelity plan holds up as the correct port, which is exactly why it went unnoticed.
      `tl.to(".${id}-con",{y:"+=${r(U(20))}cqw",duration:3.93,ease:"sine.inOut",repeat:${K.reps(ctx.L, 3.93)},yoyo:true},${at(0.9)});`,
      chips.length ? `tl.fromTo("#${id} .ochip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.3)},ease:"back.out(1.8)",stagger:${du(0.09)}},${at(1.1)});` : "",
      ...spaceTweens(id, ctx),
      ...chromeBlink(id, ctx),
    ].filter(Boolean),
  };
}

// FLEET — the whole constellation: five consoles at the reference's exact coordinates, each
// bobbing on its own phase. The reference lays these out asymmetrically on purpose; a tidy
// 2x2 grid is what made the previous port read as a generic gallery.
const FLEET_TILES = [
  { x: 150, y: 300, w: 520, h: 300 }, { x: 710, y: 260, w: 500, h: 340 },
  { x: 1250, y: 300, w: 520, h: 300 }, { x: 430, y: 640, w: 500, h: 260 },
  { x: 990, y: 640, w: 540, h: 260 },
];
function sFleet(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const pics = (shots || []).filter(Boolean);
  if (pics.length < 2) return { ...K.statement(scene, ctx), backdrop: space(id, th), chrome: chrome(th, ctx.brand), s: [...(K.statement(scene, ctx).s || []), ...spaceTweens(id, ctx), ...chromeBlink(id, ctx)] };
  // NEVER AN EMPTY FRAME: draw only as many consoles as there are pictures, and centre that
  // subset of the reference's layout rather than leaving hatched placeholders (the reference
  // ships those because it is a design handoff; a delivered film must not).
  const tiles = FLEET_TILES.slice(0, Math.min(FLEET_TILES.length, pics.length));
  const head = K.fitLines(scene.headline || scene.title || "", U(1600), U(74), 2, th.adv);

  return {
    backdrop: space(id, th),
    chrome: chrome(th, ctx.brand),
    html: `
    <div class="${id}-hd" style="position:absolute;left:0;right:0;top:${r(U(120))}cqw;text-align:center;z-index:6;opacity:0;">
      ${splitLines(head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join(""), th, head.size, 1.05, "-0.02em", th.ink, null)}
    </div>
    ${tiles.map((t, i) => `<div class="${id}-t${i}" style="position:absolute;left:${r(U(t.x))}cqw;top:${r(U(t.y))}cqw;width:${r(U(t.w))}cqw;height:${r(U(t.h))}cqw;opacity:0;">
      ${consoleFrame(th, K.shotFill(pics[i], { bg: th.panel }), { url: ctx.url })}
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-hd",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.15)});`,
      ...tiles.map((t, i) => `tl.fromTo(".${id}-t${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.6)},ease:"back.out(1.5)"},${at(0.4 + i * 0.22)});`),
      // sin(t*0.7+i)*10 — period 8.98s, half-cycle 4.49s, phase-staggered per tile.
      ...tiles.map((t, i) => `tl.to(".${id}-t${i}",{y:"+=${r(U(20))}cqw",duration:4.49,ease:"sine.inOut",repeat:${K.reps(Math.max(0.4, ctx.L - i * 0.3), 4.49)},yoyo:true},${r(ctx.T + i * 0.3)});`),
      ...spaceTweens(id, ctx),
      ...chromeBlink(id, ctx),
    ],
  };
}

// TELEMETRY — a flame-lit planet top-right, the headline left, and three glowing stat cards
// counting up. Pictureless in the reference.
function sTelemetry(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx), backdrop: space(id, th), chrome: chrome(th, ctx.brand), s: [...(K.statement(scene, ctx).s || []), ...spaceTweens(id, ctx), ...chromeBlink(id, ctx)] };
  const head = K.fitLines(scene.headline || scene.title || "", U(900), U(96), 2, th.adv);

  return {
    backdrop: space(id, th),
    chrome: chrome(th, ctx.brand),
    html: `
    ${planet(1650, 240, 150, rgba(th.flame, 0.6), "#2A0E06", `${id}b`)}
    <div class="${id}-hd" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(220))}cqw;width:${r(U(900))}cqw;opacity:0;">
      ${splitLines(head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join(""), th, head.size, 0.94, "-0.02em", th.ink, null)}
    </div>
    <div style="position:absolute;left:${r(U(110))}cqw;top:${r(U(470))}cqw;display:flex;gap:${r(U(30))}cqw;">
      ${stats.map((st, i) => `<div class="${id}-c${i}" style="background:${th.panel};border:1px solid ${rgba(th.accent, 0.4)};border-radius:${r(U(22))}cqw;box-shadow:0 0 ${r(U(50))}cqw ${rgba(th.accent, 0.16)};padding:${r(U(34))}cqw ${r(U(46))}cqw;min-width:${r(U(320))}cqw;opacity:0;">
        <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(100))}cqw;line-height:1;color:${th.accent};text-shadow:0 0 ${r(U(30))}cqw ${th.glow};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.16em;color:${th.sub};margin-top:${r(U(8))}cqw;white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
      </div>`).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-hd",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${du(0.55)},ease:"power3.out"},${at(0.15)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(1.6)"},${at(0.75 + i * 0.3)});`,
          // easeOutExpo, as the reference's Counter uses.
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.9)},ease:"expo.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.85 + i * 0.3)});`,
        ];
      }),
      ...spaceTweens(id, ctx),
      ...chromeBlink(id, ctx),
    ],
  };
}

// CTA — a huge planet rising from below frame, the mark on a glowing plate, the statement at
// 150px, and an accent launch button with its arrow.
function sGo(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1500), U(150), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
  const hasMark = !!(logo && logo.path);

  return {
    backdrop: space(id, th),
    chrome: chrome(th, ctx.brand),
    html: `
    ${planet(960, 1180, 420, rgba(th.accent, 0.4), "#0A1430", `${id}c`)}
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:${r(U(120))}cqw;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(150))}cqw;height:${r(U(150))}cqw;border-radius:${r(U(34))}cqw;background:${th.panel};border:1px solid ${rgba(th.accent, 0.5)};box-shadow:0 0 ${r(U(60))}cqw ${rgba(th.accent, 0.3)};overflow:hidden;padding:${r(U(20))}cqw;margin-bottom:${r(U(40))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-hd" style="text-align:center;opacity:0;">
        ${splitLines(head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join(""), th, head.size, 0.92, "-0.03em", th.ink, th.glow)}
      </div>
      <div class="${id}-pill" style="margin-top:${r(U(44))}cqw;display:flex;align-items:center;gap:${r(U(22))}cqw;opacity:0;">
        <span style="display:inline-flex;align-items:center;gap:${r(U(14))}cqw;padding:${r(U(20))}cqw ${r(U(48))}cqw;border-radius:${r(U(999))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.displayStack};font-weight:700;font-size:${r(K.fitOne(action, U(460), U(32), th.adv))}cqw;box-shadow:0 0 ${r(U(50))}cqw ${th.glow};white-space:nowrap;">${esc(action)} ↑</span>
        <span style="font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.1em;color:${th.sub};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${du(0.7)},ease:"back.out(1.8)"},${at(0.4)});` : "",
      `tl.fromTo(".${id}-hd",{opacity:0,y:"${r(U(50))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"power3.out"},${at(0.7)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${du(0.6)},ease:"back.out(2)"},${at(1.15)});`,
      ...spaceTweens(id, ctx),
      ...chromeBlink(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
// MEDIA LIVES WHERE THE REFERENCE PUTS IT: one console on `feature`, up to five on `fleet`,
// and the mark on the close. countdown / liftoff / telemetry are pictureless BY DESIGN — they
// carry the planet, the rocket, the smoke and the stat cards instead, so none of them is a bare
// frame. The previous spine demanded a screenshot on countdown and liftoff, which both filled
// the frame with a panel the reference does not have and starved `fleet` of pictures.
const SPEC = {
  first: "countdown", last: "go",
  middle: ["liftoff", "feature", "fleet", "telemetry"],
  shapes: {
    countdown: [], liftoff: [], feature: [900 / 560],
    fleet: [520 / 300, 500 / 340, 520 / 300, 500 / 260, 540 / 260],
    telemetry: [], go: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "feature" ? 1 : role === "fleet" ? Math.min(5, Math.max(0, budget)) : 0),
  needs: (role) => (role === "feature" ? 1 : role === "fleet" ? 2 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "telemetry") return isStats;
    if (isStats) return false;
    if (role === "feature") return budget >= 1;
    if (role === "fleet") return budget >= 2;
    return true;
  },
};
const BUILDERS = {
  countdown: sCountdown, liftoff: sLiftoff, feature: sFeature, fleet: sFleet,
  telemetry: sTelemetry, go: sGo,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: space(ctx.id, ctx.th), chrome: chrome(ctx.th, ctx.brand), s: [...(K.statement(sc, ctx).s || []), ...spaceTweens(ctx.id, ctx), ...chromeBlink(ctx.id, ctx)] }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: space(ctx.id, ctx.th), chrome: chrome(ctx.th, ctx.brand), s: [...(K.statement(sc, ctx, { centred: true }).s || []), ...spaceTweens(ctx.id, ctx), ...chromeBlink(ctx.id, ctx)] }),
};
const LABELS = {
  countdown: "COUNTDOWN", liftoff: "LIFTOFF", feature: "MISSION CONTROL", fleet: "CONSTELLATION",
  telemetry: "TELEMETRY", go: "LAUNCH",
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:1px solid ${rgba(th.accent, 0.4)}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4,
    // The reference's camera is a big lateral/vertical throw (900px / 240px) with a 1.16 zoom,
    // not the kit's default nudge — a launch film moves.
    camera: { push: 900, scale: 1.02 },
    signature: "cinematic", fallbackBrand: "ORBIT",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE, FLEET_TILES, STAR_GROUPS };
