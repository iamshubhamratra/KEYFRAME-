// NOIR SPOTLIGHT — a product film lit by ONE theatrical spotlight. Native GSAP + DOM, om_port_kit.
//
// PROVENANCE. NOT a port: no Claude Design reference exists for this pack. It is written from its own
// manifest, frames/noir-spotlight/pack.json, which is the only brief there has ever been. The pack
// carried no composer, so every film that selected noir-spotlight rendered through the GENERIC scene
// kit wearing its palette — the design below existed only as this sentence:
//
//   "Cinematic dark luxury — a product film lit by one theatrical spotlight. Near-black void
//    grounds, a single drifting volumetric beam that reveals the hero, deep falloff shadows, gold
//    hairline accents, and a film-grain vignette over everything"
//
// THE FIVE RULES, derived from that sentence plus the manifest, and enforced everywhere below:
//
//   1. ONE LAMP, AND IT IS THE ONLY LIGHT. There is exactly one beam in the film — centre-hung,
//      above the frame — and it DRIFTS: a slow swing about its own apex that never stops, with its
//      pool of light travelling underneath it on the same period. Everything in frame is either lit
//      by that lamp or falling away from it. No second source, ever, and no lit panels.
//   2. THE APERTURE IS THE CUT. `motion.cut: "iris"`, so the lamp's iris OPENS at the head of every
//      beat and SHUTS on the last one, and a picture arrives as an anamorphic matte parting from the
//      centre line. Nothing in this pack slides in from an edge — that is push/whip vocabulary and
//      belongs to other packs.
//   3. GOLD IS A HAIRLINE, NEVER A FILL — until the closing beat, where the single filled gold
//      plaque IS the call to action. `surface.flat` is true, so ONE 1.6px weight is the whole
//      ornament budget: no cards, no radii, no keylines heavier than that, and no drop shadow
//      anywhere. Where something looks raised it is because light is falling on it.
//   4. THE GRAIN AND THE FALLOFF SIT OVER EVERYTHING. Both live in the CHROME layer (outside the
//      camera), because "over everything" has to include the screenshots. In the backdrop they
//      would veil the void and nothing else.
//   5. CENTRED. `textfx.align: "center"` — the lamp is centre-hung, so the type is centre-hung. This
//      pack has no left-hand column anywhere, which is the thing that separates it at a glance from
//      every other landscape pack in the library.
//
// FONT SUBSTITUTION: Fraunces (the manifest's `typography.display`) and JetBrains Mono are bundled
// and used exactly as named. `Inter` is NOT bundled, so Figtree stands in for the body voice — the
// nearest neutral grotesque in src/fonts/pack_fonts.js. Fraunces ships here as an UPRIGHT-ONLY
// variable face (weight 1-1000, no italic), so the pull quote is set upright: `font-style:italic`
// would be synthesised and skew a serif that was never drawn to be skewed.
//
// NO BLUR, ANYWHERE. "volumetric", "falloff", "grain" and "glow" are all radial-gradients, SVG
// gradient fills and low-alpha washes. A per-scene stack of `filter: blur()` is what makes a seeked
// capture come back solid black, and this brief would otherwise ask for six of them per frame.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

// The manifest's palette, verbatim.
const VOID = "#08080B", CHARCOAL = "#14141A", SMOKE = "#2A2A33";
const BONE = "#F4F1EA", ASH = "#9A9AA6", GOLD = "#E8B23A", CRIMSON = "#D8443C";
const DISPLAY = "Fraunces", MONO = "JetBrains Mono", BODY = "Figtree";
// `motion.drift` from the manifest. The camera scales its OWN layer, so this fraction of every edge
// is off-frame for the whole beat and every measured column must divide by it (SAFE-AREA LAW).
const DRIFT = 1.045;

const STRINGS = {
  spotlight: "OPENING", feature: "IN FRAME", how: "THE MARKS", proof: "THE NUMBERS",
  context: "IN THEIR WORDS", curtain: "CURTAIN", scene: "TAKE", of: "OF",
  go: "REQUEST ACCESS", step: "MARK",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: VOID, isDark: true, packAccent: GOLD });
  return {
    accent, bg: VOID, ink: BONE, paper: BONE, panel: rgba(SMOKE, 0.55),
    sub: ASH, line: rgba(accent, 0.34), hair: rgba(BONE, 0.12),
    // THE LAMP IS TINTED BY THE BRAND, not merely edged with it. A tungsten theatre lamp is warm,
    // and mixing the accent into the light is what stops a rebranded film reading as the stock gold
    // film with one recoloured rule in it.
    lamp: K.mixHex(BONE, accent, 0.32),
    // transition_kit's `accentsFrom` lights its seams and light bars with [accent, accent2], and
    // DERIVES accent2 by spinning the accent 38 degrees when a pack does not name one — off gold that
    // lands on lime, so the shared cuts were flashing a colour this stage does not own. Naming it
    // warm white makes every cut in the film a beam of the same lamp.
    accent2: K.mixHex(accent, BONE, 0.55),
    // The counter-glow in the far corner. An unbranded film gets the manifest's crimson verbatim; a
    // rebranded one gets that same hue RELATIONSHIP (gold is 37 degrees off crimson) rotated off the
    // brand, so the stage keeps its two-source falloff instead of acquiring a stray red.
    counter: accent === GOLD ? CRIMSON : K.spin(accent, -37, -0.06, 0.5),
    adv: K.ADVANCE.mixed,
    capBg: CHARCOAL, capInk: BONE,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- the measure -------------------------------------------------------------
const M = U(120);
const COL = U(1920) - M * 2;
const SAFE = K.camSafe(DRIFT);
const TOP = U(206);      // first line of copy on a measured beat
const FLOOR = U(952);    // nothing measured reaches past here — the take rail lives below it
const HAIR = U(1.6);     // rule 3: the ONE line weight in the pack

// ---- the stage: the void and the one beam ------------------------------------
// The apex is ABOVE the frame at (960 -200) in the SVG's own user space: a lamp hung in the flies.
// Everything about the beam pivots there — the drift and the iris both.
const APEX = "960 -200";

// A percentage radius resolves against the box's own WIDTH and HEIGHT separately, so a light pool
// that should read as round needs its two radii computed from the two dimensions. `circle <pct>%`
// is invalid CSS and silently drops the ENTIRE comma-joined background, which has cost this library
// three packs — `ellipse A% B%` is the only spelling used in this file.
const pool = (w, h, x, y, color, alpha, stop = 70) =>
  `radial-gradient(ellipse ${r((w / 1920) * 100)}% ${r((h / 1080) * 100)}% at ${x}% ${y}%, ${rgba(color, alpha)} 0%, ${rgba(color, 0)} ${stop}%)`;

// THE SIGNATURE, and it is on every beat because `dress()` puts it there.
//
// Three nested groups, because three properties are animated and one tween owns one property on one
// element (om_furniture rule 2): `-iris` scales (the aperture), `-beam` rotates (the drift), and
// `-flick` carries the lamp's own unsteadiness. Neither group carries a STATIC transform, so both
// GSAP pivots are the apex in their own user space — passing a translate as well as an svgOrigin is
// what throws a rotating SVG group off-frame (learned on drive's speedometer).
function stage(id, th) {
  const shafts = [
    // the main cone, then two thin rakers either side of it: `fx.canvas: "rays"`, drawn rather than
    // simulated, so the whole effect is one paint and survives a seek.
    { p: "960,-200 520,1080 1400,1080", o: 1 },
    { p: "960,-200 296,1080 470,1080", o: 0.42 },
    { p: "960,-200 1450,1080 1624,1080", o: 0.36 },
  ].map((s) => `<polygon points="${s.p}" fill="url(#${id}-lamp)" opacity="${r(s.o)}"></polygon>`).join("");
  return `<div style="position:absolute;inset:0;background:linear-gradient(180deg, ${VOID} 0%, ${CHARCOAL} 58%, ${VOID} 100%);overflow:hidden;">
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">
      <defs>
        <linearGradient id="${id}-lamp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${th.lamp}" stop-opacity="0.3"></stop>
          <stop offset="44%" stop-color="${th.lamp}" stop-opacity="0.135"></stop>
          <stop offset="100%" stop-color="${th.lamp}" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <g class="${id}-iris"><g class="${id}-beam"><g class="${id}-flick">${shafts}</g></g></g>
    </svg>
    <div class="${id}-pool" style="position:absolute;inset:0;background:
      ${pool(1180, 360, 50, 93, th.lamp, 0.22)},
      ${pool(1560, 1000, 50, 30, th.lamp, 0.09, 72)},
      ${pool(760, 640, 97, 84, th.counter, 0.11)};"></div>
  </div>`;
}

// `motion.cut: "iris"` — the aperture opens on EVERY beat, and on the closing beat it shuts again.
// The drift is a yoyo whose HALF period is the swing, which is exactly a sine wave; the floor pool
// rides the same duration, ease and start time, so the light and the place it lands never separate
// (they cannot share a transform — one is an SVG group, the other a DOM layer).
function stageTweens(id, ctx, { close = false } = {}) {
  const swing = Math.max(4.6, ctx.L * 1.2);
  const flick = 0.9;
  const t = [
    `tl.fromTo(".${id}-iris",{scale:0.34},{scale:1,duration:${ctx.du(0.6)},ease:"expo.out",svgOrigin:"${APEX}"},${ctx.at(0)});`,
    `tl.fromTo(".${id}-beam",{rotation:-2.6},{rotation:2.6,duration:${r(swing)},ease:"sine.inOut",repeat:${K.reps(ctx.L, swing)},yoyo:true,svgOrigin:"${APEX}"},${r(ctx.T)});`,
    `tl.fromTo(".${id}-flick",{opacity:0.84},{opacity:1,duration:${r(flick)},ease:"sine.inOut",repeat:${K.reps(ctx.L, flick)},yoyo:true},${r(ctx.T)});`,
    `tl.fromTo(".${id}-pool",{x:"${r(-U(74))}cqw"},{x:"${r(U(74))}cqw",duration:${r(swing)},ease:"sine.inOut",repeat:${K.reps(ctx.L, swing)},yoyo:true},${r(ctx.T)});`,
  ];
  // The two `-iris` tweens never overlap in time: the open finishes at 0.6k, the shut starts at
  // 1.55k. Same property, strictly sequential, which is legal — concurrent would not be.
  if (close) t.push(`tl.to(".${id}-iris",{scale:0.46,duration:${ctx.du(1.1)},ease:"power2.inOut",svgOrigin:"${APEX}"},${ctx.at(1.55)});`);
  return t;
}

// ---- the veil: grain + falloff, OVER everything ------------------------------
// Rule 4. This is drawn in the CHROME layer, which sits outside `.om-cam`, so it veils the pictures
// as well as the void. A tiled radial-gradient dot field is the whole of the grain: a real film-grain
// filter is blur/noise territory, which is forbidden here.
//
// EVERY DOT GETS ITS OWN TILE SIZE, and the six sizes share no factors. Six dots on ONE
// `background-size` at a single 44px pitch is a HALFTONE, not grain — the first render showed clean
// rows and columns marching across the void. Six pitches that never re-align inside the frame read
// as noise instead.
//
// It also BOILS: two nested wrappers translate on short periods that do not divide each other (0.09s
// and 0.13s), so the field never repeats a configuration. Two wrappers because two axes means two
// tweens, and one tween owns one property on one element (om_furniture rule 2).
const GRAIN = [[13, 21, 0.26, 44], [61, 37, 0.22, 37], [37, 72, 0.24, 53], [83, 57, 0.18, 31], [26, 89, 0.22, 41], [71, 9, 0.2, 29]];
function veil(id) {
  const dots = GRAIN
    .map(([x, y, o]) => `radial-gradient(ellipse ${r(U(1.7))}cqw ${r(U(1.7))}cqw at ${x}% ${y}%, ${rgba(BONE, o)} 0%, ${rgba(BONE, 0)} 100%)`)
    .join(",");
  const tiles = GRAIN.map(([, , , t]) => `${r(U(t))}cqw ${r(U(t))}cqw`).join(",");
  return `<div class="${id}-grainA" style="position:absolute;inset:${r(-U(80))}cqw;pointer-events:none;">
      <div class="${id}-grainB" style="position:absolute;inset:0;background-image:${dots};background-size:${tiles};opacity:0.42;"></div>
    </div>
    <div style="position:absolute;inset:0;pointer-events:none;background:
      radial-gradient(ellipse ${r((3120 / 1920) * 100)}% ${r((2360 / 1080) * 100)}% at 50% 44%, ${rgba(VOID, 0)} 26%, ${rgba(VOID, 0.72)} 100%),
      linear-gradient(180deg, ${rgba(VOID, 0.55)} 0%, ${rgba(VOID, 0)} 22%, ${rgba(VOID, 0)} 74%, ${rgba(VOID, 0.62)} 100%);"></div>`;
}
const veilTweens = (id, ctx) => [
  `tl.fromTo(".${id}-grainA",{x:0},{x:"${r(U(7))}cqw",duration:0.09,ease:"none",repeat:${K.reps(ctx.L, 0.09)},yoyo:true},${r(ctx.T)});`,
  `tl.fromTo(".${id}-grainB",{y:0},{y:"${r(U(5))}cqw",duration:0.13,ease:"none",repeat:${K.reps(ctx.L, 0.13)},yoyo:true},${r(ctx.T)});`,
];

// The director's framing marks, in gold at 30%: four corner brackets that say "this is a frame".
// Static on purpose — a mark that pulses is a HUD, and this one is a lens.
function corners(th) {
  const arm = 54, inset = 66;
  const g = [[inset, inset, 1, 1], [1920 - inset, inset, -1, 1], [inset, 1080 - inset, 1, -1], [1920 - inset, 1080 - inset, -1, -1]]
    .map(([x, y, sx, sy]) => `<path d="M${x + sx * arm} ${y} L${x} ${y} L${x} ${y + sy * arm}" fill="none" stroke="${rgba(th.accent, 0.3)}" stroke-width="1.5" stroke-linecap="square"></path>`)
    .join("");
  return `<svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;">${g}</svg>`;
}

// THE SLATE — this pack's own chrome, and LAW 7 is why it exists rather than the kit's. Two reasons,
// either of them sufficient: (a) the veil has to be in this layer to sit over the pictures, and the
// kit's chrome would paint over it from the film theme; (b) the kit draws a 4px accent progress bar
// and a filled accent badge, and rule 3 forbids a gold fill anywhere before the closing beat.
function slate(ctx, th) {
  const { id } = ctx;
  const brand = String(ctx.brand || "").slice(0, 22);
  const from = ctx.total ? ctx.i / ctx.total : 0;
  return `<div class="om-chrome">
    ${veil(id)}
    ${corners(th)}
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(54))}cqw;display:flex;align-items:center;gap:${r(U(16))}cqw;">
      <span style="width:${r(U(10))}cqw;height:${r(U(10))}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${r(U(18))}cqw ${rgba(th.accent, 0.75)};flex:0 0 auto;"></span>
      <span style="font-family:${th.displayStack};font-weight:600;font-size:${r(U(25))}cqw;letter-spacing:0.16em;text-transform:uppercase;color:${th.ink};white-space:nowrap;">${esc(brand)}</span>
      ${ctx.label ? `<span style="font-family:${th.monoStack};font-size:${r(U(14))}cqw;letter-spacing:0.24em;text-transform:uppercase;color:${th.sub};white-space:nowrap;">／ ${esc(ctx.label)}</span>` : ""}
    </div>
    <div style="position:absolute;right:${r(M)}cqw;top:${r(U(60))}cqw;font-family:${th.monoStack};font-size:${r(U(14))}cqw;letter-spacing:0.26em;color:${th.sub};white-space:nowrap;">${esc(ctx.S.scene || STRINGS.scene)} ${K.pad2(ctx.i + 1)} ${esc(ctx.S.of || STRINGS.of)} ${K.pad2(ctx.total)}</div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;bottom:${r(U(48))}cqw;height:${r(HAIR)}cqw;background:${th.hair};overflow:hidden;">
      <div class="${id}-rail" style="width:100%;height:100%;background:linear-gradient(90deg, ${rgba(th.accent, 0.2)} 0%, ${th.accent} 100%);transform:scaleX(${r(from)});transform-origin:left center;"></div>
    </div>
  </div>`;
}
const slateTweens = (id, ctx) => [
  `tl.fromTo(".${id}-rail",{scaleX:${r(ctx.total ? ctx.i / ctx.total : 0)}},{scaleX:${r(ctx.total ? (ctx.i + 1) / ctx.total : 1)},duration:${r(ctx.L)},ease:"none"},${r(ctx.T)});`,
  ...veilTweens(id, ctx),
];

// EVERY BEAT IS DRESSED THE SAME WAY. The void, the one lamp and the veil are the pack's signature,
// so they are not a per-scene decision: a builder returns its copy and its cues, and this puts the
// stage under it, the veil over it and the slate around it. Routing the chrome through here is also
// what makes LAW 7 unbreakable — no builder can forget it, including the statement fallbacks.
function dress(ctx, built, opts = {}) {
  return {
    ...built,
    backdrop: stage(ctx.id, ctx.th),
    chrome: slate(ctx, ctx.th),
    s: [...(built.s || []).filter(Boolean), ...stageTweens(ctx.id, ctx, opts), ...slateTweens(ctx.id, ctx)],
  };
}

// ---- type -------------------------------------------------------------------
// `textfx.enter: "mask-reveal"` — read as a widening beam: every line of display type is uncovered
// from its CENTRE outward, never faded and never slid. A clip-path is a paint operation, so it stays
// off the layout path (scripts/test-motion-safety.js).
function reveal(id, lines, style, cls = "ln") {
  return lines.map((l) => `<span class="${id}-${cls}" style="display:block;${style}clip-path:inset(0 50% 0 50%);">${esc(l)}</span>`).join("");
}
const revealTweens = (id, ctx, at, cls = "ln", dur = 0.44) => [
  `tl.to(".${id}-${cls}",{clipPath:"inset(0 0% 0 0%)",duration:${ctx.du(dur)},ease:"expo.out",stagger:${ctx.du(0.12)}},${ctx.at(at)});`,
];

// The headline is LIT, not glowing. A wide soft halo at 26% read as a pale rectangle sitting behind
// the type in the first render — the light has to look like it is falling on the letterforms, so the
// halo is tight and faint.
const headStyle = (th, size, weight = 600) =>
  `font-family:${th.displayStack};font-weight:${weight};font-size:${r(size)}cqw;line-height:1.06;letter-spacing:-0.012em;color:${th.ink};text-shadow:0 0 ${r(U(38))}cqw ${rgba(th.lamp, 0.16)};`;

const kicker = (th, t) =>
  `<span style="font-family:${th.monoStack};font-size:${r(U(18))}cqw;letter-spacing:0.34em;text-transform:uppercase;color:${th.accent};white-space:nowrap;">${esc(t)}</span>`;

const note = (th, t, size = U(16)) =>
  `<span style="font-family:${th.monoStack};font-size:${r(size)}cqw;letter-spacing:0.26em;text-transform:uppercase;color:${th.sub};white-space:nowrap;">${esc(t)}</span>`;

// Rule 3: the one line weight, gold, and it OPENS FROM THE CENTRE like everything else here.
const hairline = (id, th, cls, w) =>
  `<div class="${id}-${cls}" style="width:${r(w)}cqw;height:${r(HAIR)}cqw;margin:0 auto;background:linear-gradient(90deg, ${rgba(th.accent, 0)} 0%, ${th.accent} 50%, ${rgba(th.accent, 0)} 100%);transform:scaleX(0);transform-origin:center center;"></div>`;
const hairlineTweens = (id, ctx, cls, at) =>
  [`tl.fromTo(".${id}-${cls}",{scaleX:0},{scaleX:1,duration:${ctx.du(0.5)},ease:"expo.out"},${ctx.at(at)});`];

// `textfx.emphasis: "glow"` — the word is not coloured in, it is LIT. A radial-gradient halo sits
// behind the letterforms and blooms open with them. This is the same device the proof beat uses at
// scale, where each figure gets its own pool of light instead of a halo.
const glowWord = (id, th, word, size, cls) =>
  `<span style="position:relative;display:inline-block;white-space:nowrap;font-family:${th.displayStack};font-weight:600;font-size:${r(size)}cqw;line-height:1.14;color:${th.accent};text-shadow:0 0 ${r(size * 0.52)}cqw ${rgba(th.accent, 0.45)};">
    <span class="${id}-${cls}" style="position:absolute;left:${r(-size * 0.5)}cqw;right:${r(-size * 0.5)}cqw;top:${r(-size * 0.55)}cqw;bottom:${r(-size * 0.55)}cqw;background:radial-gradient(ellipse 50% 50% at 50% 50%, ${rgba(th.accent, 0.3)} 0%, ${rgba(th.accent, 0)} 70%);opacity:0;"></span>
    <span style="position:relative;">${esc(word)}</span>
  </span>`;
const glowTweens = (id, ctx, cls, at) =>
  [`tl.fromTo(".${id}-${cls}",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${ctx.du(0.5)},ease:"power2.out"},${ctx.at(at)});`];

// A logo lockup, lit. The kit hands the logo to EVERY builder as its fourth argument, so the opening
// beat can wear the mark without spending any of the picture budget the manifest reserves for the
// three roles that actually carry screenshots.
function markRing(id, th, logo, size, cls = "mark") {
  if (!logo || !logo.path) return "";
  return `<div class="${id}-${cls}" style="width:${r(size)}cqw;height:${r(size)}cqw;margin:0 auto ${r(U(38))}cqw;border-radius:50%;border:${r(HAIR)}cqw solid ${rgba(th.accent, 0.55)};background:${rgba(SMOKE, 0.4)};position:relative;overflow:hidden;flex:0 0 auto;opacity:0;">
    <div style="position:absolute;inset:${r(size * 0.2)}cqw;">
      <img src="${esc(logo.path)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">
    </div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 66% 66% at 50% 18%, ${rgba(th.lamp, 0.24)} 0%, ${rgba(th.lamp, 0)} 70%);"></div>
  </div>`;
}
const markTweens = (id, ctx, at, cls = "mark") =>
  [`tl.fromTo(".${id}-${cls}",{opacity:0,scale:0.66},{opacity:1,scale:1,duration:${ctx.du(0.44)},ease:"back.out(1.5)"},${ctx.at(at)});`];

// ---- pictures ---------------------------------------------------------------
// A CINEMASCOPE BAND. The manifest's feature slots are 1728x410 — 4.2:1, which is an anamorphic
// letterbox and therefore a STRIP, not a card: a gold hairline above and below, and nothing else. No
// keyline down the sides, no radius, no shadow (`surface.flat`); the strip's short edges simply end
// in the void, which is what a matte does.
//
// K.shotFill emits `position:absolute;inset:0`, so its wrapper is positioned — otherwise the picture
// escapes and covers the furniture around it. RETURNS "" WITHOUT A PICTURE: never an empty container.
function band(cls, th, { y, x, w, h, shot, z = 4 }) {
  if (!shot || !shot.path) return "";
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};overflow:hidden;background:${CHARCOAL};border-top:${r(HAIR)}cqw solid ${rgba(th.accent, 0.5)};border-bottom:${r(HAIR)}cqw solid ${rgba(th.accent, 0.5)};box-sizing:border-box;opacity:0;">
    <div class="${cls}-rv" style="position:absolute;inset:0;clip-path:inset(50% 0 50% 0);">
      ${K.shotFill(shot, { bg: CHARCOAL, w, h, filter: "saturate(0.82) contrast(1.14) brightness(0.88)" })}
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse 58% 130% at 50% 32%, ${rgba(th.lamp, 0.16)} 0%, ${rgba(th.lamp, 0)} 68%);"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg, ${rgba(VOID, 0.44)} 0%, ${rgba(VOID, 0)} 34%, ${rgba(VOID, 0)} 60%, ${rgba(VOID, 0.58)} 100%);"></div>
    </div>
  </div>`;
}
// Rule 2 for a picture: the matte PARTS from the centre line. Two elements, so the fade and the
// clip never contend for one property.
const bandTweens = (cls, ctx, at) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.08)},ease:"none"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}-rv",{clipPath:"inset(50% 0 50% 0)"},{clipPath:"inset(0% 0 0% 0)",duration:${ctx.du(0.52)},ease:"expo.out"},${ctx.at(at)});`,
];

// A PRODUCT ON A PLINTH. The manifest gives `how` objectFit:"contain" at 998x367, so the product is
// not cropped into a box — it STANDS in the light with a gold hairline under it. K has exactly one
// media helper (shotFill) and it crops, so the contain case is written out longhand inside a
// positioned wrapper.
function plinth(cls, th, { x, y, w, h, shot }) {
  if (!shot || !shot.path) return "";
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:4;opacity:0;">
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 56% 78% at 50% 46%, ${rgba(th.lamp, 0.13)} 0%, ${rgba(th.lamp, 0)} 70%);"></div>
    <img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">
    <div class="${cls}-hl" style="position:absolute;left:12%;right:12%;bottom:${r(-U(16))}cqw;height:${r(HAIR)}cqw;background:linear-gradient(90deg, ${rgba(th.accent, 0)} 0%, ${th.accent} 50%, ${rgba(th.accent, 0)} 100%);transform:scaleX(0);transform-origin:center center;"></div>
  </div>`;
}
const plinthTweens = (cls, ctx, at) => [
  `tl.fromTo(".${cls}",{opacity:0,scale:0.94},{opacity:1,scale:1,duration:${ctx.du(0.46)},ease:"expo.out"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}-hl",{scaleX:0},{scaleX:1,duration:${ctx.du(0.44)},ease:"expo.out"},${ctx.at(at + 0.14)});`,
];

// ---- scenes -----------------------------------------------------------------
// SPOTLIGHT — the reveal. The lamp irises open on an empty stage and the title is what it finds.
// Flex-centred rather than measured from a fixed top: rule 5 wants it centre-hung, and a flow layout
// cannot collide with itself however many lines the headline turns out to be (LAW 6, satisfied by
// construction instead of by arithmetic).
// `shots` is unused and must stay in the signature: the kit calls every builder as
// (scene, ctx, shots, logo), and this beat spends none of the picture budget — the manifest reserves
// its slots for feature/how/context, and what the lamp finds here is the TITLE.
function sSpotlight(scene, ctx, shots, logo) {
  const { id, th } = ctx;
  const hasMark = !!(logo && logo.path);
  const colW = U(1420);
  const head = K.fitLines(scene.headline || scene.title || ctx.title, colW / SAFE, hasMark ? U(112) : U(140), 3, th.adv);
  const body = String(scene.subtext || scene.body || "").trim().slice(0, 170);
  const stamp = K.clampWords(String(scene.emphasis || "").trim(), 20);
  return dress(ctx, {
    html: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(M)}cqw;z-index:5;">
      ${markRing(id, th, logo, U(118))}
      <div class="${id}-kick" style="margin-bottom:${r(U(30))}cqw;opacity:0;">${kicker(th, String(scene.kicker || STRINGS.spotlight).slice(0, 30))}</div>
      <div style="width:${r(colW)}cqw;max-width:100%;text-align:center;">${reveal(id, head.lines, headStyle(th, head.size, 600))}</div>
      <div style="margin-top:${r(U(36))}cqw;width:${r(U(520))}cqw;">${hairline(id, th, "rule", U(520))}</div>
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(34))}cqw;width:${r(U(1020))}cqw;max-width:100%;text-align:center;font-family:${th.bodyStack};font-weight:400;font-size:${r(U(27))}cqw;line-height:1.6;color:${th.sub};opacity:0;">${esc(body)}</div>` : ""}
      ${stamp ? `<div style="margin-top:${r(U(34))}cqw;">${glowWord(id, th, stamp, U(44), "gw")}</div>` : ""}
    </div>`,
    s: [
      ...(hasMark ? markTweens(id, ctx, 0.1) : []),
      `tl.fromTo(".${id}-kick",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.24)},ease:"power3.out"},${ctx.at(0.22)});`,
      ...(head.lines.length ? revealTweens(id, ctx, 0.34, "ln", 0.5) : []),
      ...hairlineTweens(id, ctx, "rule", 0.86),
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.34)},ease:"power3.out"},${ctx.at(1)});` : "",
      ...(stamp ? glowTweens(id, ctx, "gw", 1.2) : []),
    ],
  });
}

// FEATURE — the anamorphic band, and the pack's picture beat. Copy above, one or two 4.2:1 strips
// below it, each matte parting from its own centre line.
function sFeature(scene, ctx, shots) {
  const { id, th } = ctx;
  const pics = (shots || []).filter((s) => s && s.path);
  const n = Math.min(2, pics.length);
  if (!n) return dress(ctx, K.statement(scene, ctx));
  const head = K.fitLines(String(scene.headline || scene.title || ""), COL / SAFE, U(84), 2, th.adv);
  // MEASURE, DO NOT GUESS. A fixed band top that suited one line runs straight under two, and the
  // copy then sits on top of the first screenshot.
  const bandTop = TOP + U(46) + head.lines.length * head.size * 1.06 + U(52);
  const gap = U(30), avail = FLOOR - bandTop;
  const h = n === 2 ? (avail - gap) / 2 : Math.min(avail, COL / (1728 / 410));
  // THE RATIO IS THE POINT. Two full-measure bands stacked in the room a headline leaves squeeze to
  // 7:1, which crops a third of the height off a picture the asset pipeline already letterboxed to
  // 4.2:1. So the HEIGHT is what the frame can give and the WIDTH follows the manifest's own ratio —
  // a narrower, centred strip with void either side, which is the more noir composition anyway.
  const w = Math.min(COL, h * (1728 / 410));
  const x = (U(1920) - w) / 2;
  const y0 = n === 2 ? bandTop : bandTop + (avail - h) / 2;
  return dress(ctx, {
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(TOP)}cqw;width:${r(COL)}cqw;text-align:center;z-index:5;">
      <div class="${id}-kick" style="margin-bottom:${r(U(24))}cqw;opacity:0;">${kicker(th, String(scene.kicker || STRINGS.feature).slice(0, 30))}</div>
      ${reveal(id, head.lines, headStyle(th, head.size))}
    </div>
    ${Array.from({ length: n }, (_, i) => band(`${id}-b${i}`, th, { x, y: y0 + i * (h + gap), w, h, shot: pics[i] })).join("")}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,y:"${r(U(14))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.22)},ease:"power3.out"},${ctx.at(0.08)});`,
      ...(head.lines.length ? revealTweens(id, ctx, 0.18) : []),
      ...Array.from({ length: n }, (_, i) => bandTweens(`${id}-b${i}`, ctx, 0.52 + i * 0.2)).flat(),
    ],
  });
}

// A SPIKE MARK — the gold cross taped to a stage floor for a performer to stand on. It is a drawn
// object, so it is drawn: SVG in its own 120x120 user space. There is no cqw inside a viewBox; only
// the box's outer size is a CSS length, and that goes through U() like everything else.
function markGlyph(th, size) {
  return `<svg viewBox="0 0 120 120" style="display:block;margin:0 auto;width:${r(size)}cqw;height:${r(size)}cqw;overflow:visible;">
    <line x1="16" y1="60" x2="104" y2="60" stroke="${th.accent}" stroke-width="2.6" stroke-linecap="round"></line>
    <line x1="60" y1="16" x2="60" y2="104" stroke="${th.accent}" stroke-width="2.6" stroke-linecap="round"></line>
    <circle cx="60" cy="60" r="18" fill="none" stroke="${rgba(th.accent, 0.5)}" stroke-width="1.6"></circle>
    <circle cx="60" cy="60" r="5.5" fill="${th.accent}"></circle>
  </svg>`;
}
// HOW — THE MARKS. The staging: one spike mark per step, each standing in its own small pool of
// light, with the product above them on its plinth when there is a product to show.
function sHow(scene, ctx, shots) {
  const { id, th } = ctx;
  const steps = K.bullets(scene, 3).map((b) => String(b).slice(0, 68));
  if (steps.length < 2) return dress(ctx, K.statement(scene, ctx, { centred: true }));
  const shot = (shots || []).find((s) => s && s.path) || null;
  const head = K.fitLines(String(scene.headline || scene.title || STRINGS.how), COL / SAFE, U(78), 2, th.adv);
  const afterHead = TOP + U(44) + head.lines.length * head.size * 1.06 + U(46);
  // BUDGET DOWNWARD FROM THE FLOOR, do not stack upward and hope. The first cut derived the row from
  // the plinth's bottom edge with a `Math.max(U(150), ...)` floor under its height — which overrode
  // the clamp, so a TWO-line headline pushed the marks to y=1048 and straight through the take rail.
  // The marks are the content of this beat, so they take a known height off the floor line first and
  // the plinth gets what is left.
  const rowH = U(226);
  const gap = U(40), cw = (COL - gap * (steps.length - 1)) / steps.length;
  const availPl = FLOOR - rowH - U(56) - (afterHead + U(52));
  const plH = Math.min(U(367), Math.max(0, availPl));
  const plW = Math.min(U(998), plH * (998 / 367));
  const plX = (U(1920) - plW) / 2;
  const plY = afterHead + U(52) + Math.max(0, (availPl - plH) / 2);
  // A plinth smaller than this is a postage stamp of a product, which is worse than no product at
  // all — so a long headline spends its room on the marks instead and the plinth stands down.
  const showPl = !!shot && plH >= U(180);
  const rowTop = showPl ? FLOOR - rowH : afterHead + Math.max(U(40), (FLOOR - afterHead - rowH) / 2);
  return dress(ctx, {
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(TOP)}cqw;width:${r(COL)}cqw;text-align:center;z-index:5;">
      <div class="${id}-kick" style="margin-bottom:${r(U(22))}cqw;opacity:0;">${kicker(th, String(scene.kicker || STRINGS.how).slice(0, 30))}</div>
      ${reveal(id, head.lines, headStyle(th, head.size))}
    </div>
    ${showPl ? plinth(`${id}-pl`, th, { x: plX, y: plY, w: plW, h: plH, shot }) : ""}
    ${steps.map((s, i) => `<div class="${id}-mk" style="position:absolute;left:${r(M + i * (cw + gap))}cqw;top:${r(rowTop)}cqw;width:${r(cw)}cqw;height:${r(rowH)}cqw;text-align:center;z-index:5;opacity:0;">
      <div style="position:absolute;inset:0;background:${pool(520, 300, 50, 40, th.lamp, 0.1)};"></div>
      <div style="position:relative;">
        ${markGlyph(th, U(62))}
        <div style="margin-top:${r(U(12))}cqw;">${note(th, `${ctx.S.step || STRINGS.step} ${K.pad2(i + 1)}`, U(14))}</div>
        <div style="margin-top:${r(U(16))}cqw;font-family:${th.displayStack};font-weight:500;font-size:${r(U(28))}cqw;line-height:1.34;color:${th.ink};">${esc(s)}</div>
      </div>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,y:"${r(U(14))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.22)},ease:"power3.out"},${ctx.at(0.08)});`,
      ...(head.lines.length ? revealTweens(id, ctx, 0.18) : []),
      ...(showPl ? plinthTweens(`${id}-pl`, ctx, 0.42) : []),
      // The marks come up in the light one after another, which is the only stagger in the pack that
      // is about sequence rather than emphasis.
      `tl.fromTo(".${id}-mk",{opacity:0,y:"${r(U(26))}cqw",scale:0.92},{opacity:1,y:0,scale:1,duration:${ctx.du(0.4)},ease:"expo.out",stagger:${ctx.du(0.16)}},${ctx.at(showPl ? 0.78 : 0.44)});`,
    ],
  });
}

// PROOF — THE BILLING BLOCK, and the ONLY beat in the film that prints figures as figures (`carry`
// routes every scene carrying two or more numbers here and nowhere else). Each figure gets its own
// pool of light — the same "glow" emphasis as the opening beat's stamp, performed at the scale of a
// whole column — separated by gold hairlines the way a theatre programme separates its billing.
function sProof(scene, ctx) {
  const { id, th } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return dress(ctx, K.statement(scene, ctx, { centred: true }));
  const head = K.fitLines(String(scene.headline || scene.title || "").slice(0, 90), COL / SAFE, U(76), 2, th.adv);
  const rowTop = TOP + U(44) + head.lines.length * head.size * 1.06 + U(64);
  const avail = FLOOR - rowTop;
  const rowH = Math.min(U(330), avail);
  const rowY = rowTop + Math.max(0, (avail - rowH) / 2);
  const gap = U(36), cw = (COL - gap * (stats.length - 1)) / stats.length;
  const figMax = Math.min(U(148), rowH * 0.46);
  // K.statLabel falls back to the scene's own subtext for any figure the bullets do not name, so a
  // stat beat whose numbers all came out of ONE sentence ("99.9% uptime, 12ms latency") printed the
  // IDENTICAL label under all three figures. A billing block with the same line three times reads as
  // a bug in the render, so a repeat prints nothing: the figure and its rule are complete without one.
  const seen = new Set();
  const labels = stats.map((_, i) => {
    const t = String(K.statLabel(scene, i) || "").trim();
    if (!t || seen.has(t)) return "";
    seen.add(t);
    return t;
  });
  return dress(ctx, {
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(TOP)}cqw;width:${r(COL)}cqw;text-align:center;z-index:5;">
      <div class="${id}-kick" style="margin-bottom:${r(U(22))}cqw;opacity:0;">${kicker(th, String(scene.kicker || STRINGS.proof).slice(0, 30))}</div>
      ${reveal(id, head.lines, headStyle(th, head.size))}
    </div>
    ${stats.map((st, i) => `<div class="${id}-fg${i}" style="position:absolute;left:${r(M + i * (cw + gap))}cqw;top:${r(rowY)}cqw;width:${r(cw)}cqw;height:${r(rowH)}cqw;text-align:center;z-index:5;opacity:0;">
      <div class="${id}-fp${i}" style="position:absolute;inset:0;background:${pool(620, 420, 50, 42, th.lamp, 0.18)};opacity:0;"></div>
      ${i ? `<div class="${id}-fd" style="position:absolute;left:${r(-gap / 2)}cqw;top:${r(rowH * 0.16)}cqw;width:${r(HAIR)}cqw;height:${r(rowH * 0.68)}cqw;background:linear-gradient(180deg, ${rgba(th.accent, 0)} 0%, ${rgba(th.accent, 0.55)} 50%, ${rgba(th.accent, 0)} 100%);transform:scaleY(0);transform-origin:center center;"></div>` : ""}
      <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div style="font-family:${th.displayStack};font-weight:600;font-size:${r(K.fitOne(`${st.v}${st.suffix}`, cw - U(50), figMax, th.adv))}cqw;line-height:1;letter-spacing:-0.03em;color:${i === 0 ? th.accent : th.ink};text-shadow:0 0 ${r(U(42))}cqw ${rgba(i === 0 ? th.accent : th.lamp, i === 0 ? 0.42 : 0.22)};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="margin-top:${r(U(22))}cqw;width:${r(cw * 0.44)}cqw;">${hairline(id, th, `fr${i}`, cw * 0.44)}</div>
        ${labels[i] ? `<div style="margin-top:${r(U(20))}cqw;">${note(th, labels[i])}</div>` : ""}
      </div>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,y:"${r(U(14))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.22)},ease:"power3.out"},${ctx.at(0.08)});`,
      ...(head.lines.length ? revealTweens(id, ctx, 0.18) : []),
      stats.length > 1 ? `tl.fromTo(".${id}-fd",{scaleY:0},{scaleY:1,duration:${ctx.du(0.5)},ease:"expo.out",stagger:${ctx.du(0.1)}},${ctx.at(0.4)});` : "",
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        const at = 0.42 + i * 0.24;
        return [
          `tl.to(".${id}-fg${i}",{opacity:1,duration:${ctx.du(0.1)},ease:"none"},${ctx.at(at)});`,
          // The lamp picks each figure out in turn: a small iris of its own.
          `tl.fromTo(".${id}-fp${i}",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${ctx.du(0.5)},ease:"expo.out"},${ctx.at(at)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${ctx.du(0.62)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${ctx.at(at + 0.06)});`,
          ...hairlineTweens(id, ctx, `fr${i}`, at + 0.3),
        ];
      }),
    ],
  });
}

// CONTEXT — THE ASIDE. The manifest's context slots are 826x162 — 5.1:1, which is not a picture but
// a SLIT: a fragment of a film still. Two of them side by side make one ribbon across the top of the
// frame, and the spotlit pull quote hangs beneath it. If no slit can be filled the quote stands
// alone in the light — the ribbon is never drawn empty.
function sContext(scene, ctx, shots) {
  const { id, th } = ctx;
  const q = String(scene.quote || scene.headline || scene.subtext || "").trim().slice(0, 230);
  if (!q) return dress(ctx, K.statement(scene, ctx, { centred: true }));
  const pics = (shots || []).filter((s) => s && s.path).slice(0, 2);
  const by = String(scene.attribution || scene.emphasis || "").trim().slice(0, 60);
  const slitW = U(826), slitH = U(162), sgap = U(20);
  const ribbonW = pics.length * slitW + Math.max(0, pics.length - 1) * sgap;
  const ribbonX = (U(1920) - ribbonW) / 2;
  const slitY = U(232);
  const qMax = pics.length ? U(56) : U(64);
  const fit = K.fitLines(q, U(1400) / SAFE, qMax, 4, th.adv);
  const qmY = pics.length ? slitY + slitH + U(96) : U(322);
  const quoteY = qmY + U(84);
  const byY = quoteY + fit.lines.length * fit.size * 1.36 + U(40);
  return dress(ctx, {
    html: `
    ${pics.map((s, i) => band(`${id}-sl${i}`, th, { x: ribbonX + i * (slitW + sgap), y: slitY, w: slitW, h: slitH, shot: s })).join("")}
    ${pics.length ? `<div style="position:absolute;left:${r(M)}cqw;top:${r(slitY + slitH + U(44))}cqw;width:${r(COL)}cqw;z-index:5;">${hairline(id, th, "rib", U(400))}</div>` : ""}
    <div class="${id}-qm" style="position:absolute;left:0;right:0;top:${r(qmY)}cqw;text-align:center;z-index:5;font-family:${th.displayStack};font-weight:600;font-size:${r(U(104))}cqw;line-height:0.7;color:${rgba(th.accent, 0.62)};opacity:0;">&ldquo;</div>
    <div style="position:absolute;left:0;right:0;top:${r(quoteY)}cqw;z-index:5;text-align:center;">
      <div style="display:inline-block;width:${r(U(1400))}cqw;max-width:100%;">
        ${reveal(id, fit.lines, `font-family:${th.displayStack};font-weight:500;font-size:${r(fit.size)}cqw;line-height:1.36;letter-spacing:-0.008em;color:${th.ink};text-shadow:0 0 ${r(U(50))}cqw ${rgba(th.lamp, 0.22)};`)}
      </div>
    </div>
    ${by ? `<div class="${id}-by" style="position:absolute;left:0;right:0;top:${r(byY)}cqw;text-align:center;z-index:5;opacity:0;">${note(th, by)}</div>` : ""}`,
    s: [
      ...pics.flatMap((_, i) => bandTweens(`${id}-sl${i}`, ctx, 0.08 + i * 0.16)),
      ...(pics.length ? hairlineTweens(id, ctx, "rib", 0.44) : []),
      `tl.fromTo(".${id}-qm",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${ctx.du(0.36)},ease:"back.out(1.6)"},${ctx.at(pics.length ? 0.5 : 0.14)});`,
      ...(fit.lines.length ? revealTweens(id, ctx, pics.length ? 0.62 : 0.26, "ln", 0.5) : []),
      by ? `tl.fromTo(".${id}-by",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.28)},ease:"power3.out"},${ctx.at(pics.length ? 1.24 : 0.92)});` : "",
    ],
  });
}

// CURTAIN — the close, and the only beat that breaks two of the pack's own rules on purpose:
//   · the crimson DRAPES come in from the edges, because a curtain is the one thing in a theatre
//     that is allowed to, and they are the manifest's crimson finally doing work;
//   · the call-to-action plaque is the single FILLED gold shape in the whole film (rule 3), which is
//     precisely what makes it read as the call rather than as more ornament.
// The iris shuts behind it all — `stageTweens(..., { close: true })`.
// THE PLAQUE'S OWN INK. `K.inkOn` switches at a relative luminance of 0.5, and this pack's gold sits
// at 0.493 — so the one filled shape in the whole film came out BONE-ON-GOLD at roughly 2:1, which
// is the least legible pair available. A saturated mid-yellow needs dark ink well before 0.5; 0.34
// puts the void on gold (about 9:1) and still leaves bone on a genuinely dark brand accent.
const plaqueInk = (th) => (K.relLum(th.accent) > 0.34 ? VOID : BONE);

function drapes(id, th) {
  const folds = (x0) => [60, 132, 206].map((d) => `<line x1="${x0 + d}" y1="0" x2="${x0 + d}" y2="1080" stroke="${rgba(th.counter, 0.34)}" stroke-width="1.6"></line>`).join("");
  return `<svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;">
    <defs>
      <linearGradient id="${id}-dgl" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${th.counter}" stop-opacity="0.4"></stop>
        <stop offset="62%" stop-color="${th.counter}" stop-opacity="0.12"></stop>
        <stop offset="100%" stop-color="${th.counter}" stop-opacity="0"></stop>
      </linearGradient>
      <linearGradient id="${id}-dgr" x1="1" y1="0" x2="0" y2="0">
        <stop offset="0%" stop-color="${th.counter}" stop-opacity="0.4"></stop>
        <stop offset="62%" stop-color="${th.counter}" stop-opacity="0.12"></stop>
        <stop offset="100%" stop-color="${th.counter}" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <g class="${id}-dl"><rect x="0" y="0" width="320" height="1080" fill="url(#${id}-dgl)"></rect>${folds(0)}</g>
    <g class="${id}-dr"><rect x="1600" y="0" width="320" height="1080" fill="url(#${id}-dgr)"></rect>${folds(1594)}</g>
  </svg>`;
}
// INSIDE A viewBox THE UNIT IS THE USER UNIT, not cqw: 320 here is 320 of the authored 1920, exactly
// as om_furniture's regMarks/dashRings author their geometry. Law 3 governs CSS lengths, and every
// CSS length in this file goes through U().
const drapeTweens = (id, ctx) => [
  `tl.fromTo(".${id}-dl",{x:-330},{x:0,duration:${ctx.du(0.8)},ease:"power2.out"},${ctx.at(0.04)});`,
  `tl.fromTo(".${id}-dr",{x:330},{x:0,duration:${ctx.du(0.8)},ease:"power2.out"},${ctx.at(0.04)});`,
];
function sCurtain(scene, ctx, logo) {
  const { id, th } = ctx;
  const hasMark = !!(logo && logo.path);
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1400) / SAFE, hasMark ? U(112) : U(132), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || "").trim(), 24) || STRINGS.go;
  return dress(ctx, {
    html: `
    ${drapes(id, th)}
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(M)}cqw;z-index:6;">
      ${markRing(id, th, logo, U(126))}
      <div style="width:${r(U(1400))}cqw;max-width:100%;text-align:center;">${reveal(id, head.lines, headStyle(th, head.size, 600))}</div>
      <div style="margin-top:${r(U(34))}cqw;width:${r(U(420))}cqw;">${hairline(id, th, "rule", U(420))}</div>
      <div class="${id}-act" style="margin-top:${r(U(40))}cqw;display:inline-block;background:${th.accent};color:${plaqueInk(th)};font-family:${th.displayStack};font-weight:600;font-size:${r(K.fitOne(action, U(640), U(32), th.adv))}cqw;letter-spacing:0.06em;padding:${r(U(20))}cqw ${r(U(46))}cqw;box-shadow:0 0 ${r(U(70))}cqw ${rgba(th.accent, 0.34)};opacity:0;">${esc(action)}</div>
      <div class="${id}-url" style="margin-top:${r(U(32))}cqw;opacity:0;">${note(th, ctx.url)}</div>
    </div>`,
    s: [
      ...drapeTweens(id, ctx),
      ...(hasMark ? markTweens(id, ctx, 0.18) : []),
      ...(head.lines.length ? revealTweens(id, ctx, 0.4, "ln", 0.5) : []),
      ...hairlineTweens(id, ctx, "rule", 0.94),
      `tl.fromTo(".${id}-act",{opacity:0,scale:0.86},{opacity:1,scale:1,duration:${ctx.du(0.36)},ease:"back.out(1.6)"},${ctx.at(1.12)});`,
      `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:${ctx.du(0.24)},ease:"none"},${ctx.at(1.34)});`,
    ],
  }, { close: true });
}

// ---- spine ------------------------------------------------------------------
const SPEC = {
  first: "spotlight", last: "curtain",
  middle: ["feature", "proof", "context", "how"],
  shapes: {
    // The manifest's own slot geometry, as ratios. `proof` and `curtain` take none: a figure beat
    // that also crops a screenshot dilutes both, and the 1728x410 shape the manifest asks for is
    // already claimed — twice — by `feature`.
    spotlight: [],
    feature: [1728 / 410, 1728 / 410],
    how: [998 / 367],
    context: [826 / 162, 826 / 162],
    proof: [], curtain: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "feature" || role === "context" ? Math.min(2, Math.max(0, budget))
    : role === "how" ? Math.min(1, Math.max(0, budget)) : 0),
  // Only `feature` is nothing without a picture. The marks, the quote and the billing block are all
  // complete in type, so they are never downgraded for want of a shot.
  needs: (role) => (role === "feature" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "proof") return isStats;
    if (isStats) return false;                    // ONE role prints figures as figures, and this is it
    // `feature` STANDS ASIDE FOR A QUOTE. The middles are picked by a rotating cursor, and feature
    // sits first in it — so on a film where the quote beat happened to land on feature's turn, the
    // customer's own words were being cropped into a letterbox band and the pull-quote layout never
    // appeared at all. Declining a beat that carries a literal `quote` costs feature nothing (there
    // is always another beat with a picture to give) and guarantees `context` gets its material.
    if (role === "feature") return budget >= 1 && !String(scene.quote || "").trim();
    if (role === "how") return K.bullets(scene, 3).length >= 2;
    if (role === "context") return !!String(scene.quote || scene.subtext || "").trim();
    return true;
  },
};

const BUILDERS = {
  spotlight: sSpotlight, feature: sFeature, how: sHow, proof: sProof, context: sContext, curtain: sCurtain,
  // The statement layouts are dressed exactly like every other beat, so a picture-poor film still
  // gets the void, the lamp, the veil and the slate — and never the kit's chrome (LAW 7).
  statement: (sc, ctx) => dress(ctx, K.statement(sc, ctx)),
  "statement-c": (sc, ctx) => dress(ctx, K.statement(sc, ctx, { centred: true })),
};

const LABELS = {
  spotlight: STRINGS.spotlight, feature: STRINGS.feature, how: STRINGS.how,
  proof: STRINGS.proof, context: STRINGS.context, curtain: STRINGS.curtain,
};

// The caption pill takes the pack's own charcoal and a gold hairline: square, because nothing in
// this film has a radius.
const css = (th, stage_) => K.baseCss(th, stage_, `
  #cap-pill { border-radius:0; border:${r(HAIR)}cqw solid ${rgba(th.accent, 0.34)}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.6,
    // `motion.drift: 1.045` from the manifest. The push is small: a luxury film settles, it does not
    // lunge — the arrival belongs to the iris, not to the camera.
    camera: { push: 90, scale: DRIFT },
    // `motion.cut: "iris"` is in the editorial pool (transition_kit.SIGNATURES), so the shared dealer
    // reaches for the pack's own cut before anything else.
    signature: "editorial", fallbackBrand: "NOIR",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
