// BLOCKFRAME — a candy-brutalist launch-poster system. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. NOT a port: there is no Claude Design reference for this pack. It is written from its
// own manifest, frames/blockframe/pack.json, which is the only brief that exists for it.
//
// WHY IT WAS BUILT. The pack had no `renderer` key, so every film that selected blockframe rendered
// through the GENERIC scene kit wearing its palette — the design below has never existed in code.
// The manifest's own words, verbatim:
//
//   "maximalist neo-brutalist: candy pastels, 4px black borders, hard shadows, loud uppercase —
//    playful, bold, product-launch energy"
//
// plus `surface.flat: true` on ground #FFFDF5, `motion.cut: "wipe"`, `motion.drift: 1.02`,
// `fx.canvas: "confetti"`, and `textfx: { enter: "spring", emphasis: "boxed", case: "upper",
// align: "left" }`. scene_kit.js already carried a two-line sketch of this pack's furniture
// ("candy-brutalist furniture: hard-bordered tape strips + a sticker burst") — the tape strips and
// the eight-point starburst below are that sketch promoted to real furniture.
//
// THE FIVE RULES, taken from that brief and enforced everywhere in this file:
//   1. EVERY ATOM IS A BLOCK. Nothing floats: each piece of content sits in a candy-pastel box with
//      a 4px BLACK keyline and a HARD offset shadow. `blk()` is the only container in the pack and
//      it is gated on content by its callers, so the first law (never draw an empty container) is
//      enforced at one site instead of six.
//   2. HARD SHADOW MEANS ZERO BLUR. `surface.flat` is true, so the shadow is a solid black offset
//      (13 authored px, no blur radius) — never a soft one, and never `filter: blur()` (a per-scene
//      stack of blurred layers makes a seeked capture come back solid black). Same reason there is
//      not one soft gradient in the pack: the ground is a flat fill, a hard 2px grid and flat
//      bordered shapes.
//   3. CANDY ROTATES, INK NEVER DOES. Each beat draws its fills from the manifest's five pastels
//      starting at its own index, so a frame carries three or four candy colours at once
//      (maximalism) while type is always black on a light fill. `skin()` is the one place that
//      decides, so no builder can put pale type on a pale block.
//   4. THE FRAME IS THE SIGNATURE. Every beat wears the same furniture: a black keyline framing the
//      whole stage, a bordered brand chip, two candy tape strips slapped across the ground, and a
//      segmented block rail counting the beats. THE CLOSING BEAT FLOODS ITS PASTEL over the whole
//      ground, so this pack MUST return its own `chrome:` from every builder — the kit's chrome
//      paints from the FILM theme and would print a pink rail on a pink flood.
//   5. LOUD UPPERCASE, LEFT ALIGNED, SPRING IN. `textfx.case: "upper"` and `align: "left"` are
//      absolute: there is no centred beat and no mixed-case display type anywhere. `enter: "spring"`
//      is `back.out(>2)` on scale+y — blocks and words land with an overshoot, never a fade.
//
// FONT SUBSTITUTION: the manifest names `Inter` (as `fonts[0]` and as `typography.display`) and
// `Space Grotesk`. Inter is NOT bundled (verified with pack_fonts.isBundled), and a display voice
// that has to carry "loud uppercase" at 150px is not served by a UI grotesk anyway, so ARCHIVO
// BLACK — bundled, and the heaviest neutral grotesque in src/fonts/pack_fonts.js — stands in for the
// display role. Space Grotesk is bundled and used as specified for body copy; Space Mono (bundled,
// the same family's mono cousin) sets the stickers and labels, which the manifest leaves unnamed.
//
// MEASURED, NOT GUESSED: Archivo Black is a very wide face — an uppercase glyph advances ~0.84em,
// not the 0.70 of `K.ADVANCE.upper` (measured off real renders; see prisma_composer.js and
// om_stage.js, which independently landed on the same number). Every fit in this file uses 0.84, so
// a headline is sized against the type that will actually be drawn.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

// The manifest's palette, verbatim.
const INK = "#000000", PAPER = "#FFFDF5", WHITE = "#FFFFFF";
const PINK = "#FE90E8", BLUE = "#C0F7FE", GREEN = "#99E885", YELLOW = "#F7CB46", CREAM = "#FFDC8B";
const CANDY = [PINK, BLUE, GREEN, YELLOW, CREAM];

const DISPLAY = "Archivo Black", BODY = "Space Grotesk", MONO = "Space Mono";
// Archivo Black, uppercase, at this pack's tracking. See the header note.
const ADV_BLACK = 0.84;

// The atoms of rule 1, in authored pixels, put through U() exactly once each. BW is the manifest's
// own "4px black borders"; BW2 is the same keyline on furniture small enough that 4px would eat it.
const BW = U(4), BW2 = U(3), SH = U(13), SH2 = U(7);
const LH = 0.94;              // display line-height: loud type sits tight

const STRINGS = {
  drop: "THE DROP", feature: "WHAT IT DOES", how: "HOW IT WORKS", proof: "THE NUMBERS",
  shout: "BIG NEWS", launch: "GET IT",
  scene: "BLOCK", of: "OF", go: "GET STARTED", step: "STEP", result: "RESULT",
  fresh: "NEW", tag: "GO",
};

function theme(brandSkin) {
  // The brand colour LEADS the five candy pastels; the pack's own four follow it. Flattening a pack
  // whose identity is "a different pastel on every block" to a single hue would erase it.
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PAPER, isDark: false, packAccent: PINK });
  return {
    accent, bg: PAPER, paper: PAPER, panel: WHITE, ink: INK,
    sub: rgba(INK, 0.66), line: INK,
    candy: [accent, ...CANDY.slice(1)],
    adv: ADV_BLACK,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', 'Helvetica Neue', Arial, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', 'Helvetica Neue', Arial, sans-serif`,
    resolvedBrand,
  };
}

// ---- the sheet ---------------------------------------------------------------
// M is the manifest's own measure: 1920 − 2×96 = 1728, which is exactly the width of its `feature`
// and `proof` slots. Deriving the margin from the slot geometry rather than picking a round number
// means a strip is printed at the size the pack asked for.
const M = U(96);
const COL = U(1728);
const TOP = U(200);          // the first content line, clear of the brand chip row
// NOTHING IS DRAWN BELOW THIS. The bound dates from when a block rail sat at 996 and a hard
// shadow hung 13px past its own box, making 946 the last usable edge (946 + 13 = 959, clear of
// the rail). The rail is gone, but the bound stays: it is also what keeps the hard shadows off
// the frame's bottom border, and widening the safe area is a layout change, not a cleanup.
const FOOT = U(946);
const GRID = 64;             // the ground's hard 2px grid, one cell per creep cycle

// The colour that clears a candy fill. Every pastel in the pack is light, so this is black virtually
// always — but a BRANDED film's accent is contrast-corrected against the light ground and can come
// back mid-dark, and a black headline on a mid-dark block is the one way this pack could ship
// something unreadable.
//
// NOT `K.inkOn`, WHICH PIVOTS AT 0.5 RELATIVE LUMINANCE. That pivot is wrong for pastels and this
// pack is made of them: the manifest's own pink (#FE90E8) sits at 0.467, so inkOn calls it "dark" and
// hands back PAPER — near-white type on candy pink, 2.0:1, when black on the same pink is 10.3:1.
// The real tie point between black and white ink is a luminance of 0.18 (brand_kit's own comment
// says the same), so the decision is made against that instead. Measured, not inherited.
const on = (hex) => (K.relLum(hex) > 0.18 ? INK : PAPER);

// Rule 1 + rule 2 in one string: candy fill, 4px black keyline, hard offset shadow, optional tilt.
// THE TILT IS THE STANDALONE `rotate:` PROPERTY, NOT `transform:`. GSAP replaces the whole
// `transform` property when it animates x/y/scale, so a static `transform:rotate()` on a tweened
// element is silently thrown away the instant the tween starts (om_furniture rule 4). `rotate:`
// composes with GSAP's transform instead of fighting it.
const blockCss = (fill, ink, tilt = 0, sh = SH) =>
  `background:${fill};border:${r(BW)}cqw solid ${ink};box-shadow:${r(sh)}cqw ${r(sh)}cqw 0 ${ink};` +
  `${tilt ? `rotate:${r(tilt)}deg;` : ""}box-sizing:border-box;`;

// THE BLOCK. The only container in the pack. Callers gate it on the content that fills it — there is
// no code path in this file that draws one of these around nothing.
function blk(cls, { x, y, w, h, fill, ink, tilt = 0, pad = 0, inner = "", z = 4 }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;${blockCss(fill, ink, tilt)}overflow:hidden;z-index:${z};${pad ? `padding:${r(pad)}cqw;` : ""}opacity:0;">
    <div style="position:relative;width:100%;height:100%;">${inner}</div>
  </div>`;
}
// `textfx.enter: "spring"`. Opacity and the spring are separate tweens on purpose: `back.out` on
// opacity overshoots past 1, which the browser clamps — the overshoot has to land on the transform,
// where it reads as the block hitting the page and settling.
const blkTweens = (cls, ctx, at) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.06)},ease:"none"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}",{y:"${r(U(54))}cqw",scale:0.92},{y:0,scale:1,duration:${ctx.du(0.44)},ease:"back.out(2.2)"},${ctx.at(at)});`,
];

// A sticker: the pack's label atom. Mono caps in a small bordered chip, knocked a few degrees off
// square. Returns "" with no text, so a caller can hand it a script field without checking first.
function sticker(th, t, { fill, ink, tilt = 0, size = U(20), pad = U(15) } = {}) {
  const txt = String(t || "").trim();
  if (!txt) return "";
  return `<span style="display:inline-block;${blockCss(fill, ink, tilt, SH2)}padding:${r(pad * 0.7)}cqw ${r(pad)}cqw;font-family:${th.monoStack};font-weight:700;font-size:${r(size)}cqw;letter-spacing:0.14em;text-transform:uppercase;color:${on(fill)};white-space:nowrap;">${esc(txt)}</span>`;
}

// `textfx.emphasis: "boxed"` — the accent is a BLOCK behind the word, never a colour on it.
const boxed = (th, word, size, fill, ink) =>
  `<span style="display:inline-block;${blockCss(fill, ink, -1.5)}padding:${r(U(12))}cqw ${r(U(24))}cqw;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1.02;text-transform:uppercase;color:${on(fill)};white-space:nowrap;">${esc(word)}</span>`;

// ---- type -------------------------------------------------------------------
// MEASURE, DO NOT GUESS. Every headline returns its own rendered HEIGHT, and everything seated
// below one computes its top from that height — a fixed y that suits one line collides with two.
function headOf(text, w, ceiling, maxLines, th) {
  const fit = K.fitLines(String(text || "").toUpperCase(), w / K.camSafe(), ceiling, maxLines, th.adv);
  return { lines: fit.lines, size: fit.size, h: fit.lines.length * fit.size * LH };
}
function mega(id, th, fit, { color, cls = "hl", tracking = -0.015 }) {
  if (!fit.lines.length) return "";
  return fit.lines.map((l) => `<span class="${id}-${cls}" style="display:block;font-family:${th.displayStack};font-size:${r(fit.size)}cqw;line-height:${LH};letter-spacing:${tracking}em;text-transform:uppercase;color:${color};opacity:0;">${esc(l)}</span>`).join("");
}
const megaTweens = (id, ctx, fit, at, cls = "hl") => (fit.lines.length ? [
  `tl.fromTo(".${id}-${cls}",{opacity:0,y:"${r(U(58))}cqw",scale:0.94},{opacity:1,y:0,scale:1,duration:${ctx.du(0.42)},ease:"back.out(2.1)",stagger:${ctx.du(0.12)},transformOrigin:"left center"},${ctx.at(at)});`,
] : []);

// ---- the ground -------------------------------------------------------------
// FLAT, per `surface.flat: true`: a solid fill, a hard-edged grid (a linear-gradient with zero-length
// stops, so it is a grid and not a wash), two flat bordered shapes and two tape strips. There is no
// soft gradient anywhere in this pack, and no `radial-gradient(circle <pct>%)` — a percentage radius
// is invalid for `circle` and silently drops the whole comma-joined background.
function tape(cls, sk, { x, y, w, h, fill, tilt }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;${blockCss(fill, sk.line, tilt, SH2)}"></div>`;
}
// `motion.cut: "wipe"` — the tapes are slapped on from off-frame at the top of every beat.
const tapeTweens = (cls, ctx, dir) => [
  `tl.fromTo(".${cls}",{x:"${r(dir * U(760))}cqw"},{x:0,duration:${ctx.du(0.5)},ease:"expo.out"},${ctx.at(0)});`,
];

// `fx.canvas: "confetti"`, as DOM blocks rather than a canvas: 26 bordered candy chips falling
// through the frame. Deterministic — index arithmetic, never Math.random, so two runs of the same
// film are byte-identical. They start ABOVE the frame, so nothing is hidden and nothing needs
// revealing: the fall itself is the entrance.
const CHIPS = Array.from({ length: 26 }, (_, i) => ({
  x: 40 + ((i * 271) % 1780),
  y: -90 - ((i * 137) % 430),
  w: 16 + (i % 3) * 6,
  h: 22 + (i % 4) * 5,
  dur: 2.4 + ((i * 7) % 11) * 0.22,
  hue: i % 5,
  spin: 180 + (i % 5) * 90,
  lag: ((i * 13) % 17) * 0.05,
}));
function confetti(id, sk, n) {
  return `<div style="position:absolute;inset:0;overflow:hidden;">${CHIPS.slice(0, n).map((c, i) =>
    `<div class="${id}-cf${i}" style="position:absolute;left:${r(U(c.x))}cqw;top:${r(U(c.y))}cqw;width:${r(U(c.w))}cqw;height:${r(U(c.h))}cqw;background:${sk.chips[c.hue % sk.chips.length]};border:${r(BW2)}cqw solid ${sk.line};box-sizing:border-box;"></div>`).join("")}</div>`;
}
const confettiTweens = (id, ctx, n) => CHIPS.slice(0, n).map((c, i) =>
  `tl.to(".${id}-cf${i}",{y:"${r(VH + U(300))}cqw",rotation:${r(c.spin)},duration:${r(c.dur)},ease:"none",repeat:${K.reps(ctx.L, c.dur)}},${ctx.at(0.08 + c.lag)});`);

function ground(id, sk, conf = 0) {
  return `<div style="position:absolute;inset:0;background:${sk.bg};overflow:hidden;">
    <div class="${id}-grid" style="position:absolute;inset:${r(-U(GRID))}cqw;background-image:linear-gradient(${rgba(sk.line, 0.13)} ${r(U(2))}cqw, transparent ${r(U(2))}cqw),linear-gradient(90deg, ${rgba(sk.line, 0.13)} ${r(U(2))}cqw, transparent ${r(U(2))}cqw);background-size:${r(U(GRID))}cqw ${r(U(GRID))}cqw;"></div>
    <div class="${id}-orb" style="position:absolute;left:${r(U(1470))}cqw;top:${r(U(566))}cqw;width:${r(U(420))}cqw;height:${r(U(420))}cqw;border-radius:50%;background:${sk.shape1};border:${r(BW)}cqw solid ${sk.line};box-sizing:border-box;"></div>
    <div style="position:absolute;left:${r(-U(96))}cqw;top:${r(U(690))}cqw;width:${r(U(300))}cqw;height:${r(U(300))}cqw;">
      <div class="${id}-sq" style="position:absolute;inset:0;background:${sk.shape2};border:${r(BW)}cqw solid ${sk.line};box-sizing:border-box;"></div>
    </div>
    ${tape(`${id}-tp0`, sk, { x: -U(130), y: U(126), w: U(520), h: U(44), fill: sk.tape0, tilt: -5 })}
    ${tape(`${id}-tp1`, sk, { x: U(1490), y: U(884), w: U(560), h: U(44), fill: sk.tape1, tilt: 4 })}
    ${conf ? confetti(id, sk, conf) : ""}
  </div>`;
}
// The rotating square gets its tilt FROM ITS TWEEN (from:6 to:26), not from a static `rotate:` — a
// static rotation plus a GSAP `rotation` would compose and double the angle. Splitting the wrapper
// (static position) from the inner square (animated) is the same discipline as an SVG group that
// carries both a transform and a spin.
const groundTweens = (id, ctx, sk, conf = 0) => {
  const g = Math.max(8, ctx.L * 2.6), b = Math.max(4.5, ctx.L * 1.3), sp = Math.max(14, ctx.L * 3);
  return [
    // Exactly one cell, so the creep loops with no visible snap.
    `tl.to(".${id}-grid",{x:"${r(U(GRID))}cqw",y:"${r(U(GRID))}cqw",duration:${r(g)},ease:"none"},${r(ctx.T)});`,
    `tl.to(".${id}-orb",{y:"${r(-U(34))}cqw",duration:${r(b)},ease:"sine.inOut",repeat:${K.reps(ctx.L, b)},yoyo:true},${r(ctx.T)});`,
    `tl.fromTo(".${id}-sq",{rotation:6},{rotation:26,duration:${r(sp)},ease:"sine.inOut",repeat:${K.reps(ctx.L, sp)},yoyo:true},${r(ctx.T)});`,
    ...tapeTweens(`${id}-tp0`, ctx, -1),
    ...tapeTweens(`${id}-tp1`, ctx, 1),
    ...(conf ? confettiTweens(id, ctx, conf) : []),
  ];
};
// ONE call site for the ground's markup AND its motion. jungle shipped `{...statement, backdrop:
// canopy()}` — the backdrop drawn, its tweens dropped, every animal in the film frozen. Pairing them
// in a single return value is what makes that mistake impossible here.
const groundOf = (ctx, sk, conf = 0) => ({ html: ground(ctx.id, sk, conf), s: groundTweens(ctx.id, ctx, sk, conf) });

// The eight-point sticker burst, from scene_kit's own blockframe vocabulary. Its own SVG with its own
// 0–100 user space, so the spin's `svgOrigin` is "50 50" — the pivot expressed in the ELEMENT'S own
// coordinates. The <g> carries NO static transform: a group with both a static transform and a GSAP
// rotation has to be split, or the pivot doubles and throws the shape off-frame.
function burst(cls, th, { x, y, d, fill, ink, label = "", labelSize = U(30) }) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pts.push(`${r(50 + Math.cos(a) * 48)},${r(50 + Math.sin(a) * 48)}`);
    pts.push(`${r(50 + Math.cos(a + Math.PI / 8) * 27)},${r(50 + Math.sin(a + Math.PI / 8) * 27)}`);
  }
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(d)}cqw;height:${r(d)}cqw;z-index:6;opacity:0;">
    <svg viewBox="0 0 100 100" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;"><g class="${cls}-sp"><polygon points="${pts.join(" ")}" fill="${fill}" stroke="${ink}" stroke-width="2.6"></polygon></g></svg>
    ${label ? `<span style="position:absolute;inset:0;display:grid;place-items:center;font-family:${th.displayStack};font-size:${r(labelSize)}cqw;line-height:1;text-transform:uppercase;color:${on(fill)};">${esc(label)}</span>` : ""}
  </div>`;
}
const burstTweens = (cls, ctx, at) => {
  const rock = Math.max(3.2, ctx.L * 0.9);
  return [
    `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.06)},ease:"none"},${ctx.at(at)});`,
    `tl.fromTo(".${cls}",{scale:0.2},{scale:1,duration:${ctx.du(0.46)},ease:"back.out(2.6)"},${ctx.at(at)});`,
    `tl.fromTo(".${cls}-sp",{rotation:-9},{rotation:9,duration:${r(rock)},ease:"sine.inOut",repeat:${K.reps(ctx.L, rock)},yoyo:true,svgOrigin:"50 50"},${r(ctx.T)});`,
  ];
};

// ---- the beat's palette ------------------------------------------------------
// RULE 3 IN ONE PLACE. Each beat starts its rotation at its own index, so consecutive beats never
// wear the same combination and one frame still carries three or four pastels at once.
function skin(ctx, flood = false) {
  const candy = ctx.th.candy;
  const at = (k) => candy[(ctx.i + k) % candy.length];
  if (flood) {
    // THE CLOSING FLOOD. A pastel becomes the ground, so every colour decision inverts — and because
    // this pack must survive a BRANDED accent that contrast-correction may have pushed dark, the
    // foreground is RESOLVED against the flood rather than assumed to be black. Blocks on the flood
    // are paper, so they read whatever the flood turned out to be.
    //
    // The flood is candy[0] — the BRAND's own colour on a branded film — not the beat's rotation
    // step. The close is the one beat where the colour is a brand statement rather than variety, and
    // a rotation that lands the user's hue on some films and not others is not a brand feature.
    const bg = candy[0];
    const fg = on(bg);
    return {
      flood: true, bg, ink: fg, line: fg, sub: rgba(fg, 0.74), acc: fg, chip: PAPER,
      shape1: K.mixHex(bg, fg, 0.14), shape2: K.mixHex(bg, fg, 0.1),
      tape0: PAPER, tape1: WHITE, chips: [PAPER, WHITE, PAPER, WHITE, PAPER],
      pick: (k) => (k % 2 ? WHITE : PAPER),
    };
  }
  return {
    flood: false, bg: PAPER, ink: INK, line: INK, sub: rgba(INK, 0.66), acc: at(0), chip: at(0),
    shape1: at(1), shape2: at(3), tape0: at(2), tape1: at(4), chips: candy,
    pick: (k) => at(k),
  };
}

// ---- the chrome -------------------------------------------------------------
// THIS PACK MUST OWN ITS CHROME (rule 4). The kit's chrome paints from the FILM theme: on the
// flooded closing beat its accent rail would be pink on pink and its wordmark would ignore the
// inverted foreground entirely. Neither is visible to the ghost guard, because the elements ARE
// revealed — they are revealed in the ground's own colour.
//
// The furniture is also where the pack's name lives: a 4px black keyline FRAMES every beat, and the
// progress rule is a row of BLOCKS, one per beat, rather than a bar.
function hud(ctx, sk) {
  const { id, th } = ctx;
  const S = ctx.S || STRINGS;
  const brand = (String(ctx.brand || "").toUpperCase().slice(0, 18) || "BLOCKFRAME");
  const label = String(ctx.label || "").toUpperCase().slice(0, 22);
  return `<div class="om-chrome">
    <div style="position:absolute;inset:${r(U(30))}cqw;border:${r(BW)}cqw solid ${sk.line};box-sizing:border-box;"></div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(54))}cqw;display:flex;align-items:center;gap:${r(U(16))}cqw;">
      <span style="display:inline-grid;place-items:center;width:${r(U(60))}cqw;height:${r(U(60))}cqw;${blockCss(sk.chip, sk.line, -3, SH2)}font-family:${th.displayStack};font-size:${r(U(30))}cqw;line-height:1;color:${on(sk.chip)};">${esc(brand.slice(0, 1))}</span>
      <span style="font-family:${th.displayStack};font-size:${r(K.fitOne(brand, U(420), U(32), th.adv))}cqw;text-transform:uppercase;letter-spacing:-0.01em;color:${sk.ink};white-space:nowrap;">${esc(brand)}</span>
      ${label ? `<span style="font-family:${th.monoStack};font-weight:700;font-size:${r(U(17))}cqw;letter-spacing:0.18em;text-transform:uppercase;color:${sk.sub};white-space:nowrap;">// ${esc(label)}</span>` : ""}
    </div>
  </div>`;
}
// THE BLOCK RAIL AND ITS BEAT COUNTER ARE GONE. The rail was a row of one bordered cell per
// beat, earlier cells flooded, the current one filling linearly across its own clip — the same
// Instagram-Stories strip reel drew, in this pack's neo-brutal costume. The counter beside it
// ("03 / 06") said the same thing in text. Both describe the viewer's position in the playback,
// which a finished advertisement has no business showing.
//
// Worth recording: the old comment here called this "the library's standard progress idiom",
// which is exactly how the habit spread — each engine copied it believing it was a convention
// rather than a defect. `npm run test:no-playback-chrome` now makes it a build failure. This
// pack's class was `-cell`, matching no progress vocabulary at all, so it is the guard's SHAPE
// detector (one linear 0->1 fill per scene) that catches a reimplementation here.
const hudTweens = () => [];

// THE PICTURELESS BEAT. The kit's `statement` layout wearing this pack's ground and chrome — and its
// ground TWEENS, which is the pairing jungle dropped. Every builder's "I did not get what I need"
// path comes here rather than drawing its own layout with the picture removed.
function pictureless(scene, ctx, centred = false) {
  const sk = skin(ctx);
  const base = K.statement(scene, ctx, { centred });
  const g = groundOf(ctx, sk);
  return { ...base, backdrop: g.html, chrome: hud(ctx, sk), s: [...base.s, ...g.s, ...hudTweens(ctx.id, ctx)] };
}

// ---- scenes -----------------------------------------------------------------
// THE DROP — the opening poster. Kicker sticker, mega uppercase headline, the emphasis word in a
// boxed candy block (`textfx.emphasis: "boxed"`), body copy in a cream block, the mark in a white
// chip and a "NEW" starburst. Product-launch energy means the confetti is already falling.
function sDrop(scene, ctx, shots, logo) {
  const sk = skin(ctx), { id, th } = ctx;
  const S = ctx.S || STRINGS;
  const hasMark = !!(logo && logo.path);
  const body = String(scene.subtext || scene.body || "").trim().slice(0, 140);
  const stamp = K.clampWords(String(scene.emphasis || "").toUpperCase(), 16);
  // The headline clears the mark chip and the burst on the right. The ceiling drops when there is
  // body copy to seat beneath it — three lines at 150 plus a boxed stamp plus a paragraph does not
  // fit above the rail, and discovering that at render time is how a pack ships type over type.
  const colW = COL - U(340);
  const head = headOf(scene.headline || scene.title || ctx.title, colW, body ? U(112) : U(150), 3, th);
  if (!head.lines.length) return pictureless(scene, ctx);

  const kickY = TOP;
  const headY = kickY + U(84);
  const stampY = headY + head.h + U(30);
  const stampH = U(104);
  const bodyY = stampY + (stamp ? stampH + U(26) : 0);
  // Body copy is sized from the ROWS it will actually occupy, then only drawn if those rows fit
  // above the rail. A block that has to clip its own paragraph is worse than no block.
  const bodyW = U(1120), bodySize = U(27);
  const rows = Math.max(1, Math.ceil((body.length * bodySize * K.ADVANCE.mixed) / (bodyW - U(64))));
  const bodyH = rows * bodySize * 1.42 + U(52);
  const showBody = !!body && bodyY + bodyH <= FOOT;

  const g = groundOf(ctx, sk, 12);
  const kickFill = sk.pick(0), stampFill = sk.pick(2), bodyFill = sk.pick(4), burstFill = sk.pick(1);
  return {
    backdrop: g.html,
    chrome: hud(ctx, sk),
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(kickY)}cqw;z-index:5;opacity:0;">
      ${sticker(th, String(scene.kicker || S.drop || STRINGS.drop).slice(0, 26), { fill: kickFill, ink: sk.line, tilt: -3 })}
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headY)}cqw;width:${r(colW)}cqw;z-index:4;">
      ${mega(id, th, head, { color: sk.ink })}
    </div>
    ${stamp ? `<div class="${id}-stamp" style="position:absolute;left:${r(M)}cqw;top:${r(stampY)}cqw;z-index:5;opacity:0;">${boxed(th, stamp, U(70), stampFill, sk.line)}</div>` : ""}
    ${showBody ? blk(`${id}-body`, {
      x: M, y: bodyY, w: bodyW, h: bodyH, fill: bodyFill, ink: sk.line, tilt: -0.8, pad: U(26),
      inner: `<div style="font-family:${th.bodyStack};font-weight:500;font-size:${r(bodySize)}cqw;line-height:1.42;color:${on(bodyFill)};">${esc(body)}</div>`,
    }) : ""}
    ${hasMark ? blk(`${id}-mark`, {
      x: M + COL - U(180), y: TOP, w: U(180), h: U(180), fill: WHITE, ink: sk.line, tilt: 3, pad: U(22), z: 6,
      inner: `<img src="${esc(logo.path)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">`,
    }) : ""}
    ${burst(`${id}-bst`, th, { x: M + COL - U(250), y: U(452), d: U(220), fill: burstFill, ink: sk.line, label: String(S.fresh || STRINGS.fresh).slice(0, 5), labelSize: U(34) })}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(40))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.26)},ease:"back.out(2)"},${ctx.at(0.06)});`,
      ...megaTweens(id, ctx, head, 0.18),
      stamp ? `tl.fromTo(".${id}-stamp",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${ctx.du(0.34)},ease:"back.out(2.6)",transformOrigin:"left center"},${ctx.at(0.66)});` : "",
      ...(showBody ? blkTweens(`${id}-body`, ctx, 0.8) : []),
      ...(hasMark ? blkTweens(`${id}-mark`, ctx, 0.3) : []),
      ...burstTweens(`${id}-bst`, ctx, 0.92),
      ...g.s,
      ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// WHAT IT DOES — the manifest's widest slot (1728×410 cover screenshots) as a bordered letterbox
// STRIP, plus, when a second picture exists, a smaller card standing beside it. The 1180×280 strip is
// the manifest's 4.21:1 exactly; two full-width strips stacked would have to be 6:1 each to fit above
// the rail, which is not a screenshot any more, it is a slice of one.
function sFeature(scene, ctx, shots) {
  const sk = skin(ctx), { id, th } = ctx;
  const S = ctx.S || STRINGS;
  const n = Math.min(2, (shots || []).length);
  if (!n) return pictureless(scene, ctx);
  const head = headOf(scene.headline || scene.title || "", COL - U(120), U(96), 2, th);

  const kickY = TOP;
  const headY = kickY + U(80);
  const stripY = headY + head.h + U(36);
  const wide = n === 2;
  // A TILT MUST NOT CROSS THE KEYLINE. A w-wide block rotated t degrees reaches (w/2)*sin(t) past
  // each end, and this pack adds a hard offset shadow on top of that — so a full-measure strip at
  // -0.9deg pushed its corners outside the frame border on both sides. Reserve the excursion.
  const TILT = 0.9;
  const bleed = (COL / 2) * Math.sin((TILT * Math.PI) / 180) + SH;
  const stripW = wide ? U(1180) : COL - bleed * 2;
  const stripH = wide
    ? U(280)                                                   // 1180/280 = 4.21 — the manifest's own ratio
    : Math.min(U(410), Math.max(U(240), FOOT - stripY - U(20)));
  const cardW = U(480), cardH = U(360);
  const cardX = M + U(1230), cardY = Math.max(TOP + U(60), stripY - U(40));

  const g = groundOf(ctx, sk);
  const kickFill = sk.pick(0), frameFill = sk.pick(2), cardFill = sk.pick(3);
  return {
    backdrop: g.html,
    chrome: hud(ctx, sk),
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(kickY)}cqw;z-index:5;opacity:0;">
      ${sticker(th, String(scene.kicker || S.feature || STRINGS.feature).slice(0, 26), { fill: kickFill, ink: sk.line, tilt: -3 })}
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headY)}cqw;width:${r(COL - U(120))}cqw;z-index:4;">
      ${mega(id, th, head, { color: sk.ink })}
    </div>
    ${blk(`${id}-st0`, {
      x: M + (COL - stripW) / 2, y: stripY, w: stripW, h: stripH, fill: frameFill, ink: sk.line, tilt: -TILT, pad: BW * 1.5,
      // The wrapper's inner div is position:relative, so shotFill's inset:0 lands exactly on it and
      // the capture cannot escape over the keyline it is framed by.
      inner: K.shotFill(shots[0], { bg: frameFill, w: stripW, h: stripH }),
    })}
    ${wide ? blk(`${id}-st1`, {
      x: cardX, y: cardY, w: cardW, h: cardH, fill: cardFill, ink: sk.line, tilt: 3, pad: BW * 1.5, z: 6,
      inner: K.shotFill(shots[1], { bg: cardFill, w: cardW, h: cardH }),
    }) : ""}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(40))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.24)},ease:"back.out(2)"},${ctx.at(0.05)});`,
      ...megaTweens(id, ctx, head, 0.14),
      ...blkTweens(`${id}-st0`, ctx, 0.44),
      // The strip WIPES open after it lands — `motion.cut: "wipe"`, read literally, on the picture.
      `tl.fromTo(".${id}-st0",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:${ctx.du(0.46)},ease:"expo.out"},${ctx.at(0.44)});`,
      ...(wide ? blkTweens(`${id}-st1`, ctx, 0.66) : []),
      ...g.s,
      ...hudTweens(id, ctx),
    ],
  };
}

// HOW IT WORKS — numbered steps, one candy block each, beside the manifest's illustration slot. That
// slot is `objectFit: "contain"` (998×367), so the 816×300 box holds the same 2.72:1 and the image is
// written out by hand: K has exactly ONE media helper, shotFill, and it crops.
function sHow(scene, ctx, shots) {
  const sk = skin(ctx), { id, th } = ctx;
  const S = ctx.S || STRINGS;
  const steps = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 44)).filter(Boolean);
  if (steps.length < 2) return pictureless(scene, ctx);
  const shot = (shots || [])[0] || null;
  const headText = String(scene.headline || S.how || STRINGS.how).toUpperCase();
  const headSize = K.fitOne(headText, (COL - U(60)) / K.camSafe(), U(88), th.adv);

  const kickY = TOP;
  const headY = kickY + U(80);
  const rowTop = headY + headSize * LH + U(40);
  const colW = shot ? U(820) : COL;
  const gap = U(24);
  const rowH = Math.min(U(190), (FOOT - rowTop - gap * (steps.length - 1)) / steps.length);
  const illW = U(816), illH = U(300);

  const g = groundOf(ctx, sk);
  const kickFill = sk.pick(0);
  return {
    backdrop: g.html,
    chrome: hud(ctx, sk),
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(kickY)}cqw;z-index:5;opacity:0;">
      ${sticker(th, String(scene.kicker || S.how || STRINGS.how).slice(0, 26), { fill: kickFill, ink: sk.line, tilt: -3 })}
    </div>
    <div class="${id}-hd" style="position:absolute;left:${r(M)}cqw;top:${r(headY)}cqw;width:${r(COL - U(60))}cqw;z-index:4;font-family:${th.displayStack};font-size:${r(headSize)}cqw;line-height:${LH};letter-spacing:-0.015em;text-transform:uppercase;color:${sk.ink};opacity:0;">${esc(headText)}</div>
    ${steps.map((s, i) => {
      const fill = sk.pick(i + 1);
      const fit = K.fitLines(s, (colW - U(180)) / K.camSafe(), U(38), 2, th.adv);
      return blk(`${id}-sp${i}`, {
        x: M, y: rowTop + i * (rowH + gap), w: colW, h: rowH, fill, ink: sk.line, tilt: i % 2 ? 0.8 : -0.8, pad: U(22),
        inner: `<div style="position:absolute;inset:0;display:flex;align-items:center;gap:${r(U(24))}cqw;">
          <span style="display:inline-grid;place-items:center;flex:0 0 auto;width:${r(U(66))}cqw;height:${r(U(66))}cqw;background:${on(fill)};border:${r(BW2)}cqw solid ${on(fill)};box-sizing:border-box;font-family:${th.displayStack};font-size:${r(U(32))}cqw;line-height:1;color:${fill};">${esc(K.pad2(i + 1))}</span>
          <span style="font-family:${th.displayStack};font-size:${r(fit.size)}cqw;line-height:1.1;text-transform:uppercase;color:${on(fill)};">${fit.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</span>
        </div>`,
      });
    }).join("")}
    ${shot ? blk(`${id}-ill`, {
      x: M + U(860), y: rowTop + U(20), w: illW, h: illH, fill: WHITE, ink: sk.line, tilt: 1.6, pad: U(20),
      inner: `<img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">`,
    }) : ""}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(40))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.24)},ease:"back.out(2)"},${ctx.at(0.05)});`,
      `tl.fromTo(".${id}-hd",{opacity:0,y:"${r(U(50))}cqw",scale:0.95},{opacity:1,y:0,scale:1,duration:${ctx.du(0.4)},ease:"back.out(2.1)",transformOrigin:"left center"},${ctx.at(0.14)});`,
      ...steps.flatMap((_, i) => blkTweens(`${id}-sp${i}`, ctx, 0.4 + i * 0.16)),
      ...(shot ? blkTweens(`${id}-ill`, ctx, 0.62) : []),
      ...g.s,
      ...hudTweens(id, ctx),
    ],
  };
}

// THE NUMBERS — the one role that prints figures as figures. Each figure is a poster block: a huge
// black numeral counting up, its label on a sticker beneath it. The manifest also gives `proof` a
// 1728×410 screenshot slot, so one strip is printed at that ratio (880×209) under the row, with the
// starburst beside it. Nothing here invents a figure the script never claimed.
function sProof(scene, ctx, shots) {
  const sk = skin(ctx), { id, th } = ctx;
  const S = ctx.S || STRINGS;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return pictureless(scene, ctx);
  const shot = (shots || [])[0] || null;
  const headText = String(scene.headline || scene.title || S.proof || STRINGS.proof).toUpperCase().slice(0, 52);
  const headSize = K.fitOne(headText, (COL - U(60)) / K.camSafe(), U(80), th.adv);

  const kickY = TOP;
  const headY = kickY + U(80);
  const figY = headY + headSize * LH + U(30);
  const stripH = U(209), stripW = U(880);       // 880/209 = 4.21 — the manifest's proof ratio
  const stripY = FOOT - stripH;
  const figH = Math.min(U(320), stripY - figY - U(30));
  const gap = U(30);
  const figW = (COL - gap * (stats.length - 1)) / stats.length;

  const g = groundOf(ctx, sk);
  const kickFill = sk.pick(0), burstFill = sk.pick(3);
  return {
    backdrop: g.html,
    chrome: hud(ctx, sk),
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(kickY)}cqw;z-index:5;opacity:0;">
      ${sticker(th, String(scene.kicker || S.proof || STRINGS.proof).slice(0, 26), { fill: kickFill, ink: sk.line, tilt: -3 })}
    </div>
    <div class="${id}-hd" style="position:absolute;left:${r(M)}cqw;top:${r(headY)}cqw;width:${r(COL - U(60))}cqw;z-index:4;font-family:${th.displayStack};font-size:${r(headSize)}cqw;line-height:${LH};letter-spacing:-0.015em;text-transform:uppercase;color:${sk.ink};opacity:0;">${esc(headText)}</div>
    ${stats.map((st, i) => {
      const fill = sk.pick(i + 1);
      const ink = on(fill);
      const numSize = K.fitOne(`${st.v}${st.suffix}`, figW - U(80), U(150), th.adv);
      const lab = K.statLabel(scene, i) || String(S.result || STRINGS.result);
      return blk(`${id}-fg${i}`, {
        x: M + i * (figW + gap), y: figY, w: figW, h: figH, fill, ink: sk.line, tilt: i % 2 ? 1.2 : -1.2, pad: U(28),
        inner: `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:${r(U(20))}cqw;">
          <div style="font-family:${th.displayStack};font-size:${r(numSize)}cqw;line-height:0.94;letter-spacing:-0.03em;color:${ink};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
          <div>${sticker(th, lab, { fill: on(ink), ink, tilt: -1.5, size: U(19) })}</div>
        </div>`,
      });
    }).join("")}
    ${shot ? blk(`${id}-pf`, {
      x: M, y: stripY, w: stripW, h: stripH, fill: sk.pick(4), ink: sk.line, tilt: -0.8, pad: BW * 1.5,
      inner: K.shotFill(shot, { bg: sk.pick(4), w: stripW, h: stripH }),
    }) : ""}
    ${burst(`${id}-bst`, th, { x: M + U(970), y: stripY - U(8), d: U(196), fill: burstFill, ink: sk.line, label: String(S.tag || STRINGS.tag).slice(0, 4), labelSize: U(32) })}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(40))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.24)},ease:"back.out(2)"},${ctx.at(0.05)});`,
      `tl.fromTo(".${id}-hd",{opacity:0,y:"${r(U(48))}cqw",scale:0.95},{opacity:1,y:0,scale:1,duration:${ctx.du(0.38)},ease:"back.out(2.1)",transformOrigin:"left center"},${ctx.at(0.12)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          ...blkTweens(`${id}-fg${i}`, ctx, 0.3 + i * 0.14),
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${ctx.du(0.5)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${ctx.at(0.4 + i * 0.14)});`,
        ];
      }),
      ...(shot ? blkTweens(`${id}-pf`, ctx, 0.78) : []),
      ...burstTweens(`${id}-bst`, ctx, 0.88),
      ...g.s,
      ...hudTweens(id, ctx),
    ],
  };
}

// BIG NEWS — the loudest beat, and the pack's signature: `textfx.emphasis: "boxed"` applied to a
// WHOLE LINE. Each line of the claim sits on its own candy block, staircased right and knocked off
// square, springing in one after another. It needs nothing but words, which is why it leads the
// middles: on a three-beat film the pack still shows its own design instead of the kit's fallback.
//
// The manifest's `context` slots (826×162 productImages) become a shelf of ultra-thin bands beneath
// the stack — 849×166 is that 5.1:1 letterbox exactly. Gated: no picture, no shelf.
function sShout(scene, ctx, shots) {
  const sk = skin(ctx), { id, th } = ctx;
  const S = ctx.S || STRINGS;
  const n = Math.min(2, (shots || []).length);
  const copy = String(scene.quote || scene.headline || scene.emphasis || scene.subtext || "").trim();
  const fit = K.fitLines(copy.toUpperCase(), (COL - U(220)) / K.camSafe(), n ? U(84) : U(120), 3, th.adv);
  if (!fit.lines.length) return pictureless(scene, ctx);
  const by = String(scene.attribution || (scene.quote ? scene.emphasis || scene.subtext : "") || "").trim().slice(0, 54);

  const bandW = U(849), bandH = U(166);          // 849/166 = 5.11 — the manifest's context ratio
  const shelfY = FOOT - bandH;
  const lineTop = TOP + U(20);
  const lineH = fit.size * 1.06 + U(28) + BW * 2;
  const step = lineH + U(16);
  const stackEnd = lineTop + fit.lines.length * step - U(16);
  const byY = n
    ? Math.min(stackEnd + U(22), shelfY - U(70))
    : Math.min(stackEnd + U(22), FOOT - U(64));

  const g = groundOf(ctx, sk);
  const kickFill = sk.pick(0), burstFill = sk.pick(4);
  return {
    backdrop: g.html,
    chrome: hud(ctx, sk),
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(TOP - U(66))}cqw;z-index:5;opacity:0;">
      ${sticker(th, String(scene.kicker || S.shout || STRINGS.shout).slice(0, 26), { fill: kickFill, ink: sk.line, tilt: -3 })}
    </div>
    ${fit.lines.map((l, i) => {
      const fill = sk.pick(i + 1);
      return `<div class="${id}-ln" style="position:absolute;left:${r(M + i * U(24))}cqw;top:${r(lineTop + i * step)}cqw;z-index:${4 + i};opacity:0;">
        <span style="display:inline-block;${blockCss(fill, sk.line, i % 2 ? 1.1 : -1.4)}padding:${r(U(12))}cqw ${r(U(26))}cqw;font-family:${th.displayStack};font-size:${r(fit.size)}cqw;line-height:1.06;letter-spacing:-0.015em;text-transform:uppercase;color:${on(fill)};white-space:nowrap;">${esc(l)}</span>
      </div>`;
    }).join("")}
    ${by ? `<div class="${id}-by" style="position:absolute;left:${r(M + U(24))}cqw;top:${r(byY)}cqw;z-index:7;opacity:0;">${sticker(th, by, { fill: WHITE, ink: sk.line, tilt: 2, size: U(20) })}</div>` : ""}
    ${Array.from({ length: n }, (_, i) => blk(`${id}-bd${i}`, {
      x: M + i * (bandW + U(30)), y: shelfY, w: bandW, h: bandH, fill: sk.pick(i + 3), ink: sk.line,
      tilt: i % 2 ? 0.9 : -0.9, pad: BW * 1.5,
      inner: K.shotFill(shots[i], { bg: sk.pick(i + 3), w: bandW, h: bandH }),
    })).join("")}
    ${n === 1 ? burst(`${id}-bst`, th, { x: M + U(1000), y: shelfY - U(6), d: U(178), fill: burstFill, ink: sk.line, label: String(S.tag || STRINGS.tag).slice(0, 4), labelSize: U(30) }) : ""}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(40))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.24)},ease:"back.out(2)"},${ctx.at(0.04)});`,
      // The whole point of the beat: each boxed line SLAMS in, one after the other.
      `tl.to(".${id}-ln",{opacity:1,duration:${ctx.du(0.06)},ease:"none",stagger:${ctx.du(0.16)}},${ctx.at(0.16)});`,
      `tl.fromTo(".${id}-ln",{x:"${r(-U(70))}cqw",scale:0.9},{x:0,scale:1,duration:${ctx.du(0.42)},ease:"back.out(2.4)",stagger:${ctx.du(0.16)},transformOrigin:"left center"},${ctx.at(0.16)});`,
      by ? `tl.fromTo(".${id}-by",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.26)},ease:"back.out(2)"},${ctx.at(0.74)});` : "",
      ...Array.from({ length: n }, (_, i) => blkTweens(`${id}-bd${i}`, ctx, 0.6 + i * 0.14)).flat(),
      ...(n === 1 ? burstTweens(`${id}-bst`, ctx, 0.8) : []),
      ...g.s,
      ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// GET IT — the close. THE PASTEL FLOODS THE GROUND (rule 4), the mark and the button are paper blocks
// so they read against whatever that flood turned out to be, and the confetti the manifest asks for
// (`fx.canvas: "confetti"`) is at full density. For the last role the kit hands the LOGO in the third
// argument as well as the fourth; the fourth is the one this reads, because it is the one every role
// gets.
function sLaunch(scene, ctx, _last, logo) {
  const sk = skin(ctx, true), { id, th } = ctx;
  const S = ctx.S || STRINGS;
  const hasMark = !!(logo && logo.path);
  const head = headOf(scene.headline || scene.emphasis || ctx.title, COL - U(340), U(140), 2, th);
  if (!head.lines.length) return pictureless(scene, ctx);
  const action = K.clampWords(String(scene.emphasis || "").toUpperCase(), 22) || String(S.go || STRINGS.go).toUpperCase();

  const markY = TOP;
  const headY = hasMark ? markY + U(200) : U(300);
  const btnY = headY + head.h + U(40);
  const btnH = U(118);
  const urlY = btnY + btnH + U(26);

  const g = groundOf(ctx, sk, 26);
  const btnFill = sk.pick(0), burstFill = sk.pick(1);
  return {
    backdrop: g.html,
    chrome: hud(ctx, sk),
    html: `
    ${hasMark ? blk(`${id}-mark`, {
      x: M, y: markY, w: U(160), h: U(160), fill: WHITE, ink: sk.line, tilt: -3, pad: U(20), z: 6,
      inner: `<img src="${esc(logo.path)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">`,
    }) : ""}
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headY)}cqw;width:${r(COL - U(340))}cqw;z-index:4;">
      ${mega(id, th, head, { color: sk.ink })}
    </div>
    <div class="${id}-btn" style="position:absolute;left:${r(M)}cqw;top:${r(btnY)}cqw;z-index:6;opacity:0;">
      <span style="display:inline-block;${blockCss(btnFill, sk.line, -1.2)}padding:${r(U(24))}cqw ${r(U(46))}cqw;font-family:${th.displayStack};font-size:${r(K.fitOne(action, U(680), U(58), th.adv))}cqw;line-height:1;text-transform:uppercase;color:${on(btnFill)};white-space:nowrap;">${esc(action)}</span>
    </div>
    <div class="${id}-url" style="position:absolute;left:${r(M)}cqw;top:${r(urlY)}cqw;z-index:6;opacity:0;">
      ${sticker(th, ctx.url, { fill: WHITE, ink: sk.line, tilt: 1.6, size: U(22) })}
    </div>
    ${burst(`${id}-bst`, th, { x: M + COL - U(280), y: U(300), d: U(280), fill: burstFill, ink: sk.line, label: String(S.tag || STRINGS.tag).slice(0, 4), labelSize: U(44) })}`,
    s: [
      ...(hasMark ? blkTweens(`${id}-mark`, ctx, 0.06) : []),
      ...megaTweens(id, ctx, head, 0.2),
      `tl.fromTo(".${id}-btn",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${ctx.du(0.38)},ease:"back.out(2.8)",transformOrigin:"left center"},${ctx.at(0.6)});`,
      `tl.fromTo(".${id}-url",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.26)},ease:"back.out(2)"},${ctx.at(0.78)});`,
      ...burstTweens(`${id}-bst`, ctx, 0.42),
      ...g.s,
      ...hudTweens(id, ctx),
    ],
  };
}

// ---- spine ------------------------------------------------------------------
const SPEC = {
  first: "drop", last: "launch",
  // ORDER MATTERS MORE THAN IT LOOKS. `shout` is the only middle that can carry ANY beat, so putting
  // it first — kinetic-bold's arrangement — made the role cycle hand it every beat the others
  // refused: an eight-beat film came out with three identical shout beats. Behind `feature` it
  // becomes the pack's filler instead of its default, and the same film comes out
  // feature/shout/feature/proof/shout/how. The "shortest film still shows the signature" guarantee is
  // unaffected: on a three-beat film with no pictures `feature` cannot carry and the fall-through
  // reaches `shout` anyway.
  middle: ["feature", "shout", "how", "proof"],
  shapes: {
    // Straight off the manifest's media.slotsByRole. feature 1728×410 → 4.21 (drawn 1180×280 when a
    // second picture shares the beat, which is the same ratio); its second slot is the collage card
    // at 480×360, this pack's own addition and the one shape here the manifest does not name.
    // how 998×367 → 2.72. proof 1728×410 → 4.21. context 826×162 → 5.10, twice, on `shout`.
    drop: [], shout: [826 / 162, 826 / 162], feature: [1728 / 410, 480 / 360],
    how: [998 / 367], proof: [1728 / 410], launch: [],
    statement: [], "statement-c": [],
  },
  slots: (role, budget) => {
    const room = Math.max(0, budget);
    if (role === "feature") return Math.min(2, room);
    if (role === "shout") return Math.min(2, room);
    if (role === "how" || role === "proof") return Math.min(1, room);
    return 0;
  },
  // Only `feature` is nothing without a picture. Every other role's imagery is furniture hung on a
  // beat that stands up without it, so nothing else can degrade into an empty frame.
  needs: (role) => (role === "feature" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "proof") return isStats;
    if (isStats) return false;                          // only `proof` prints figures as figures
    if (role === "feature") return budget >= 1;
    if (role === "how") return K.bullets(scene, 3).length >= 2;
    if (role === "shout") return !!String(scene.quote || scene.headline || scene.emphasis || scene.subtext || "").trim();
    return true;
  },
};
const BUILDERS = {
  drop: sDrop, shout: sShout, feature: sFeature, how: sHow, proof: sProof, launch: sLaunch,
  statement: (sc, ctx) => pictureless(sc, ctx),
  // THE ONE PLACE `textfx.align: "left"` BENDS, and deliberately. The kit alternates its two
  // pictureless variants precisely so an asset-poor film does not print the identical composition
  // three beats running — that reads as a stuck render, which is a worse failure than a centred
  // paragraph. Every beat this pack draws ITSELF is left-aligned; only the kit's fallback centres.
  "statement-c": (sc, ctx) => pictureless(sc, ctx, true),
};
const LABELS = {
  drop: STRINGS.drop, shout: STRINGS.shout, feature: STRINGS.feature,
  how: STRINGS.how, proof: STRINGS.proof, launch: STRINGS.launch,
};

// The caption pill is a block like everything else: square corners, 4px keyline, hard shadow, opaque
// paper. `baseCss` sets an 88%-alpha fill and a radius; both are overridden here.
//
// THE CAPTION IS THE ONE THING NOT SET IN CAPS. `textfx.case: "upper"` governs the film's own
// on-screen text; a subtitle is accessibility copy that may run two long lines in any language, and
// uppercasing it costs real legibility for no design gain (it is also the node the multilang caption
// injector writes into, so the less this pack imposes on it the better).
const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border-radius:0; background:${PAPER}; border:${r(BW)}cqw solid ${INK}; box-shadow:${r(SH2)}cqw ${r(SH2)}cqw 0 ${INK}; }
  #cap-text { font-weight:700; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 3.6,
    // `motion.drift: 1.02` from the manifest — the smallest drift of any pack, because a flat poster
    // must not breathe like a lit one — with a hard shove of a push to match `motion.cut: "wipe"`.
    camera: { push: 160, scale: 1.02 },
    signature: "editorial", fallbackBrand: "BLOCKFRAME",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
