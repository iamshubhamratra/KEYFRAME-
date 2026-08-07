// FABLE STORYBOOK — a warm parchment storybook. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. NOT a port: no Claude Design reference exists for this pack. It is written from its
// own manifest, frames/fable-storybook/pack.json (plus that frame's FRAME.md), which is the only
// brief that exists for it. The pack had no `renderer`, so every film that chose fable-storybook
// rendered through the GENERIC scene kit wearing its palette — the design existed only as prose.
//
//   "warm storybook: parchment, ink-brown serif spirit, watercolor terracotta/sage/dusk washes,
//    paper planes + firefly orbs in gentle 3D — for narratives, brand stories, emotional arcs"
//
//   FRAME.md: "PAPER FIRST … terracotta is the emphasis hue, sage and dusk are supporting washes,
//   honey is the once-per-scene magic." · "Photos are MEMORIES: inside page-cards, slightly
//   rotated (±2-3°), with a warm linen scrim." · "Motion is gentle: slow drifts, soft fades,
//   page-turn wipes — never snappy spring pops." · "Every scene turns like a page."
//
// THE RULES DERIVED FROM THAT BRIEF, AND ENFORCED HERE:
//   1. PAPER FIRST. Parchment and linen are the only grounds; type is ink-brown SERIF at every
//      size (Georgia's spirit); terracotta is the ONLY emphasis hue; sage and dusk exist only as
//      washes in the margins. No pure white, no black, no saturated primary, no glass.
//   2. THE PAPER SKY IS ON EVERY PAGE. The signature — drifting paper planes, firefly orbs,
//      1-2 watercolour washes, flowing ribbons, a deckle edge and paper tooth — lives in ONE
//      shared `page()` backdrop + `pageTweens()` pair that every builder returns, including both
//      statement fallbacks. `fx.three:"paper"` and `fx.canvas:"ribbon"` are both drawn here (this
//      family is DOM/SVG only, so the paper sky is SVG rather than WebGL).
//   3. HONEY IS THE FIREFLIES, AND NOTHING ELSE. "no more than one honey element per scene" is
//      unenforceable if two beats reach for honey independently, so the firefly field IS the
//      honey moment on every beat and no other element is allowed the colour.
//   4. PHOTOS ARE NEVER RAW. Every picture sits in a page-card: parchment, hairline, 14px corner,
//      one soft shadow, tilted 2-3°, with a linen scrim so its colours sink into the paper. One
//      card per film turns in 3D (`rotationY -100 -> 0`) — the page opening, as FRAME asks.
//   5. GENTLE MOTION ONLY. `textfx.enter:"drift"` is a slow y+opacity drift per LINE (never a
//      whip or a clip snap), `textfx.emphasis:"underline-grow"` is a terracotta rule drawn under
//      one word, and `motion.cut:"wash"` is a pigment BLOOM: the wash layer swells onto the page
//      as the beat arrives. Everything eases sine/power2 — no back.out, no springs.
//
// UNITS. FRAME.md's typography table is already in this file's unit — its `cqw` is % of the 1920
// frame, which is exactly what U(px) computes — so heading-xl 4.6cqw is U(88), stat-number 4.0cqw
// is U(77) and card-title 1.35cqw is U(26). Those are used as CEILINGS. The two exceptions are
// deliberate: micro-label 12px and body 1.0cqw (19px) are unreadable at video bitrates, so labels
// run at U(17-18) and body at U(28) — a frame-layer table for a web page, lifted for film.
// Every CSS length goes through Q() = U(px) + "cqw" (Law 3, mechanically). Coordinates INSIDE an
// SVG viewBox are raw 1920x1080 user units and must NOT be converted — see planeField().
//
// FONT SUBSTITUTION: neither family the manifest names is bundled (verified with
// pack_fonts.isBundled). Georgia -> SPECTRAL, a warm literary serif that carries the storybook
// identity; a grotesque here would delete the pack. Spectral bundles 400 and 700 ONLY, so no
// weight between them appears in this file. Inter (micro-labels) -> FIGTREE. The pack names no
// mono face at all, so `monoStack` IS the Figtree label stack — every label in the film is the
// same atom, which is what FRAME's single `micro-label` style asks for.
//
// CUT SIGNATURE: `organic` (liquid-slide / shape-morph / orbit-swing / iris / ribbon-sweep), not
// `editorial`. Two reasons, one aesthetic and one hard: ribbon-sweep IS this pack's own
// `fx.canvas:"ribbon"` and the organic pool has no snappy move in it; and `editorial` carries
// `light-wipe`, whose overlay markup contains a literal `filter:blur(1.2cqw)` — the one thing a
// pack whose captures must never come back black cannot emit (Law 1). Do not "restore" editorial.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;
// Q — the only way a length is written in this file: authored px -> cqw, in one step.
const Q = (px) => `${r(U(px))}cqw`;

const PARCHMENT = "#FAF5EA", LINEN = "#F2EADA", INK = "#33261A";
const TERRA = "#D8734B", SAGE = "#7FA37C", DUSK = "#7A93B8", HONEY = "#E8B84B";
const DISPLAY = "Spectral", LABEL = "Figtree";
// The serif fallback names Georgia on purpose: it is the brief's face, and if the host has it the
// substitution is invisible. It sits in the FALLBACK position only, exactly as Arial does in the
// kit's own default stack.
const SERIF = `Georgia, 'Times New Roman', serif`;

const STRINGS = {
  once: "CHAPTER ONE", journey: "THE JOURNEY", passage: "THE PASSAGE", turn: "THE TURN",
  keepsake: "THE KEEPSAKE", after: "EVER AFTER", chapter: "CHAPTER",
  page: "PAGE", of: "OF", go: "Begin the story",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PARCHMENT, isDark: false, packAccent: TERRA });
  return {
    accent, bg: PARCHMENT, paper: PARCHMENT, parchment: PARCHMENT, linen: LINEN, panel: LINEN,
    ink: INK, sub: rgba(INK, 0.78), line: rgba(INK, 0.12), edge: rgba(INK, 0.1),
    // Sage, dusk and honey stay LITERAL under a rebrand. The accent is the emphasis hue and it
    // travels with the brand; the supporting washes are what make the paper read as a storybook
    // rather than as one hue smeared over everything, so they are not derived from it.
    sage: SAGE, dusk: DUSK, honey: HONEY,
    planeLit: LINEN, planeShade: K.mixHex(LINEN, INK, 0.14), planeEdge: rgba(INK, 0.34),
    adv: K.ADVANCE.mixed,
    capBg: PARCHMENT, capInk: INK,
    ...K.fontStacks(DISPLAY, LABEL, SERIF, [LABEL]),
    // AFTER the spread, deliberately: the pack has no mono voice, and a real monospace label in a
    // watercolour storybook reads as a receipt.
    monoStack: `'${LABEL}', system-ui, sans-serif`,
    bodyStack: `'${DISPLAY}', ${SERIF}`,
    resolvedBrand,
  };
}

// ---- the page ----------------------------------------------------------------
const M = U(104);                        // FRAME slide-pad, generous: the margin IS the paper
const COL = U(1920) - M * 2;             // 1712 authored px of measure
const TOP = U(240);                      // content starts below the masthead
const FOOT = U(920);                     // ...and ends above the thread + the caption node

// 1-2 washes per scene, IN THE MARGINS, per role — FRAME assigns the hues by beat: terracotta
// blooms on the opening, sage carries the journey, dusk cools the turn.
const WASHES = {
  once: [{ c: "accent", x: 14, y: 20, s: 680, o: 0.17 }, { c: "sage", x: 88, y: 80, s: 520, o: 0.1 }],
  journey: [{ c: "sage", x: 84, y: 24, s: 620, o: 0.15 }, { c: "accent", x: 10, y: 84, s: 500, o: 0.1 }],
  passage: [{ c: "sage", x: 16, y: 78, s: 640, o: 0.14 }, { c: "dusk", x: 90, y: 18, s: 500, o: 0.11 }],
  turn: [{ c: "dusk", x: 80, y: 28, s: 700, o: 0.18 }, { c: "accent", x: 12, y: 86, s: 480, o: 0.1 }],
  keepsake: [{ c: "accent", x: 88, y: 72, s: 620, o: 0.15 }, { c: "dusk", x: 13, y: 20, s: 500, o: 0.1 }],
  after: [{ c: "accent", x: 50, y: 96, s: 780, o: 0.18 }, { c: "sage", x: 15, y: 18, s: 520, o: 0.1 }],
};
const washFor = (role) => WASHES[role] || WASHES.passage;

// FOUR PAPER PLANES, at four depths. "nearer planes larger and softer-moving": scale and period
// rise together, so the big near plane crosses slowly and the small far one hurries.
// x/y/dx/dy here are SVG USER UNITS (the 1920x1080 viewBox), NOT cqw — converting them would
// shrink the whole field by a factor of 19.
const PLANES = [
  { x: 330, y: 250, s: 1.15, rot: -9, dx: 250, dy: -80, spin: 4, dur: 22 },
  { x: 1640, y: 760, s: 0.95, rot: 11, dx: -190, dy: -110, spin: -3, dur: 19 },
  { x: 1470, y: 300, s: 0.78, rot: 6, dx: -210, dy: 70, spin: 5, dur: 16 },
  { x: 900, y: 880, s: 0.6, rot: -5, dx: 190, dy: -50, spin: -4, dur: 13 },
];

// `fx.canvas:"ribbon"` — the flowing watercolour ribbons, kept to the top and bottom margins so
// they never sit under copy. They only translate: a rotation inside a translated SVG group needs
// svgOrigin in the group's OWN space (Law 10), and a ribbon that only drifts needs no pivot at all.
const RIBBONS = [
  { c: "sage", o: 0.14, dx: 90, dur: 24, d: "M-260 990 C 240 900 620 1050 1040 955 C 1420 875 1800 995 2180 925 L2180 1140 L-260 1140 Z" },
  { c: "dusk", o: 0.11, dx: -80, dur: 28, d: "M-260 130 C 200 40 560 175 980 95 C 1400 15 1780 135 2180 60 L2180 -140 L-260 -140 Z" },
  { c: "accent", o: 0.08, dx: 70, dur: 20, d: "M-260 720 C 260 655 560 795 1000 730 C 1440 665 1800 800 2180 740 L2180 812 C 1800 872 1440 737 1000 802 C 560 867 260 727 -260 792 Z" },
];

// 18 FIREFLY ORBS — the pack's whole honey budget. A radial-gradient, never a blurred dot: a
// per-scene stack of `filter:blur()` layers is what makes a seeked capture come back solid black.
// `ellipse 62% 62%` and not `circle 62%`, which is invalid CSS and drops the entire background.
const FLIES = Array.from({ length: 18 }, (_, i) => {
  const s = i * 61.7;
  return { x: (s % 92) + 4, y: ((s * 1.7) % 84) + 8, d: 14 + (i % 3) * 8, ph: i % 3 };
});

// The deckle edge — a torn linen bottom margin, so a scene handoff feels like a page.
function deckle(th) {
  const step = 64;
  let d = "M0 60 L0 24";
  for (let x = 0; x < 1920; x += step) {
    const k = x / step;
    const y = 20 + ((k * 37) % 13) - 6;
    d += ` Q ${x + step / 2} ${r(y + (k % 2 ? 11 : -9))} ${x + step} ${r(y)}`;
  }
  d += " L1920 60 Z";
  return `<svg viewBox="0 0 1920 60" preserveAspectRatio="none" style="position:absolute;left:0;right:0;bottom:0;width:100%;height:${Q(60)};display:block;">
    <path d="${d}" fill="${th.linen}" stroke="${rgba(INK, 0.08)}" stroke-width="1.4"></path>
  </svg>`;
}

// THE PAPER SKY + THE PAGE. One backdrop, returned by every builder, so the signature cannot be
// missing from a beat. Nothing here is hidden except the wash, which the cut reveals.
function page(id, th, role) {
  const blobs = washFor(role)
    .map((b) => `radial-gradient(ellipse ${r((b.s / 1920) * 100)}% ${r((b.s / 1080) * 100)}% at ${b.x}% ${b.y}%, ${rgba(th[b.c], b.o)} 0%, ${rgba(th[b.c], 0)} 70%)`)
    .join(",");
  const ribbons = RIBBONS.map((rb, i) => `<path class="${id}-rb${i}" d="${rb.d}" fill="${rgba(th[rb.c], rb.o)}"></path>`).join("");
  const planes = PLANES.map((p, i) => `<g transform="translate(${p.x} ${p.y})">
      <g class="${id}-pl${i}">
        <g transform="scale(${r(p.s)}) rotate(${p.rot})">
          <path d="M-64 -26 L64 0 L-30 2 Z" fill="${th.planeLit}" stroke="${th.planeEdge}" stroke-width="2" stroke-linejoin="round"></path>
          <path d="M-64 26 L64 0 L-30 2 Z" fill="${th.planeShade}" stroke="${th.planeEdge}" stroke-width="2" stroke-linejoin="round"></path>
        </g>
      </g>
    </g>`).join("");
  const flies = FLIES.map((f) => `<div class="${id}-fy${f.ph}" style="position:absolute;left:${r(f.x)}%;top:${r(f.y)}%;width:${Q(f.d)};height:${Q(f.d)};border-radius:50%;background:radial-gradient(ellipse 62% 62% at 50% 50%, ${rgba(HONEY, 0.6)} 0%, ${rgba(HONEY, 0)} 70%);opacity:0.3;"></div>`).join("");
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <div class="${id}-wash" style="position:absolute;inset:${Q(-200)};opacity:0;">
      <div class="${id}-washi" style="position:absolute;inset:0;background:${blobs};"></div>
    </div>
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;display:block;">${ribbons}</svg>
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">${planes}</svg>
    <div class="${id}-fly" style="position:absolute;inset:0;">${flies}</div>
    <div style="position:absolute;inset:0;background-image:radial-gradient(circle 1px at 50% 50%, ${rgba(INK, 0.05)} 0 100%, transparent 100%);background-size:${Q(7)} ${Q(7)};"></div>
    ${deckle(th)}
  </div>`;
}

// The page's own motion, plus the masthead thread — paired with page() on purpose, so a builder
// cannot draw the sky and forget to move it (or move a layer it never drew).
function pageTweens(id, ctx) {
  const { L, T } = ctx;
  // "everything slows to stillness" on the closing beat: same vocabulary, less of it.
  const calm = ctx.isLast ? 0.45 : 1;
  const slow = ctx.isLast ? 1.6 : 1;
  const wd = Math.max(9, L * 2.4) * slow, fd = Math.max(11, L * 2.8) * slow;
  const out = [
    // `motion.cut:"wash"` — pigment blooms onto the page as the beat arrives. Bloom (opacity +
    // scale) and drift (x/y) ride TWO elements: one element cannot hold two overlapping transform
    // tweens without them overwriting each other.
    `tl.fromTo(".${id}-wash",{opacity:0,scale:1.12},{opacity:1,scale:1,duration:${ctx.du(1.15)},ease:"sine.out"},${ctx.at(0)});`,
    `tl.fromTo(".${id}-washi",{x:"${Q(-26 * calm)}",y:"${Q(16 * calm)}"},{x:"${Q(26 * calm)}",y:"${Q(-16 * calm)}",duration:${r(wd)},ease:"sine.inOut",repeat:${K.reps(L, wd)},yoyo:true},${r(T)});`,
    `tl.fromTo(".${id}-fly",{x:"${Q(-16 * calm)}",y:"${Q(11 * calm)}"},{x:"${Q(16 * calm)}",y:"${Q(-11 * calm)}",duration:${r(fd)},ease:"sine.inOut",repeat:${K.reps(L, fd)},yoyo:true},${r(T)});`,
  ];
  // Fireflies pulse in three phase groups — opacity only, so the group's drift above is untouched.
  for (let p = 0; p < 3; p++) {
    const d = (2.6 + p * 0.7) * slow;
    out.push(`tl.fromTo(".${id}-fy${p}",{opacity:0.2},{opacity:${r(0.9 - p * 0.12)},duration:${r(d)},ease:"sine.inOut",repeat:${K.reps(L, d)},yoyo:true,stagger:0.19},${r(T + p * 0.35)});`);
  }
  // The planes glide. ONE tween per plane covering x, y and rotation together — see the note on
  // PLANES: these are SVG user units, and the animated group is nested inside the static
  // translate so GSAP never overwrites the placement (Law 10).
  PLANES.forEach((p, i) => {
    const d = p.dur * slow;
    out.push(`tl.fromTo(".${id}-pl${i}",{x:0,y:0,rotation:0},{x:${r(p.dx * calm)},y:${r(p.dy * calm)},rotation:${r(p.spin * calm)},duration:${r(d)},ease:"sine.inOut",repeat:${K.reps(L, d)},yoyo:true},${r(T)});`);
  });
  RIBBONS.forEach((rb, i) => {
    const d = rb.dur * slow;
    out.push(`tl.fromTo(".${id}-rb${i}",{x:0},{x:${r(rb.dx * calm)},duration:${r(d)},ease:"sine.inOut",repeat:${K.reps(L, d)},yoyo:true},${r(T)});`);
  });
  out.push(`tl.to(".${id}-thread",{scaleX:${r(ctx.total ? (ctx.i + 1) / ctx.total : 1)},duration:${r(L)},ease:"none"},${r(T)});`);
  return out;
}

// ---- atoms -------------------------------------------------------------------
// FRAME's one label style: Figtree caps, 0.22em, terracotta. Never bold serif, never large.
const micro = (th, t, color) =>
  `<span style="font-family:${th.monoStack};font-weight:700;font-size:${Q(18)};letter-spacing:0.22em;text-transform:uppercase;color:${color || th.accent};white-space:nowrap;">${esc(t)}</span>`;

// The chapter-chip: linen pill, hairline, micro-label. It rides the CHROME, so every beat opens
// with its chapter marker exactly as FRAME's narrative rhythm asks.
const chip = (th, t) =>
  `<span style="display:inline-flex;align-items:center;gap:${Q(10)};padding:${Q(9)} ${Q(20)};border-radius:${Q(999)};background:${th.linen};border:1px solid ${rgba(INK, 0.12)};">
    <span style="width:${Q(9)};height:${Q(9)};border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>${micro(th, t)}
  </span>`;

// THIS PACK OWNS ITS CHROME. Not because the ground alternates (it never does — paper always) but
// because the kit's HUD is a wordmark tile, a scene counter and a progress rail, and this film is
// a BOOK: a chapter-chip, a serif title, a folio, and a terracotta thread stitched along the
// foot. Returning it from every builder also stops the kit emitting its now-orphaned progress
// tween (om_port_kit.buildFilm keys that off `chrome == null`).
function storyChrome(ctx) {
  const { th, id, i, total, label, S } = ctx;
  const brand = String(ctx.brand || "").slice(0, 22);
  const folio = `${S.page || "PAGE"} ${K.pad2(i + 1)} ${S.of || "OF"} ${K.pad2(total)}`;
  return `<div class="om-chrome">
    <div style="position:absolute;left:${Q(104)};top:${Q(48)};display:flex;align-items:center;gap:${Q(20)};">
      ${chip(th, String(label || S.chapter || "").slice(0, 26))}
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${Q(27)};color:${th.ink};white-space:nowrap;">${esc(brand)}</span>
    </div>
    <div style="position:absolute;right:${Q(104)};top:${Q(58)};font-family:${th.monoStack};font-weight:700;font-size:${Q(17)};letter-spacing:0.22em;text-transform:uppercase;color:${rgba(INK, 0.5)};white-space:nowrap;">${esc(folio)}</div>
    <div style="position:absolute;left:${Q(104)};right:${Q(104)};bottom:${Q(54)};height:${Q(2)};background:${rgba(INK, 0.12)};overflow:hidden;">
      <div class="${id}-thread" style="width:100%;height:100%;background:${th.accent};transform:scaleX(${r(ctx.total ? ctx.i / ctx.total : 0)});transform-origin:left center;"></div>
    </div>
  </div>`;
}

// `textfx.enter:"drift"` — display type drifts up into place, one LINE at a time on a long sine
// ease. Never clipped, never whipped: the brief forbids snappy pops outright.
// Weight is 400 or 700 and nothing between: Spectral bundles exactly those two, and a 500 here
// would be a browser-synthesised faux weight on the pack's own display face.
function driftLines(id, th, lines, size, cls, { color, weight = 700, lh = 1.14 } = {}) {
  return lines.map((l) => `<span class="${id}-${cls}" style="display:block;font-family:${th.displayStack};font-weight:${weight};font-size:${r(size)}cqw;line-height:${lh};letter-spacing:-0.006em;color:${color || th.ink};opacity:0;">${esc(l)}</span>`).join("");
}
const driftTw = (id, ctx, cls, at, { dy = 36, dur = 0.66, stagger = 0.16 } = {}) =>
  [`tl.fromTo(".${id}-${cls}",{opacity:0,y:"${Q(dy)}"},{opacity:1,y:0,duration:${ctx.du(dur)},ease:"power2.out",stagger:${ctx.du(stagger)}},${ctx.at(at)});`];

// `textfx.emphasis:"underline-grow"`. The floor is U(3), not 3: a bare `3` resolves to 3cqw =
// 58px and paints a solid terracotta block over the word it is meant to underline (the bug this
// library already shipped once).
const underlined = (id, th, word, size, cls) =>
  `<span style="position:relative;display:inline-block;white-space:nowrap;">${esc(word)}<span class="${id}-${cls}" style="position:absolute;left:0;right:0;bottom:${r(-size * 0.15)}cqw;height:${r(Math.max(U(3), size * 0.055))}cqw;border-radius:${Q(4)};background:${th.accent};transform:scaleX(0);transform-origin:left center;"></span></span>`;
const underlineTw = (id, ctx, cls, at) =>
  [`tl.to(".${id}-${cls}",{scaleX:1,duration:${ctx.du(0.5)},ease:"power2.out"},${ctx.at(at)});`];

// A PAGE-CARD. THREE nested boxes, each with exactly one owner: GSAP animates the outer (the
// arrival) and the middle (the 3D page-turn), and the STATIC tilt lives innermost. One element
// cannot carry both a static `rotate()` and a GSAP transform — the second silently replaces the
// first, which is how a tilted card snaps flat mid-tween.
function pageCard(cls, th, { x, y, w, h, inner, tilt = -2 }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;perspective:${Q(1400)};opacity:0;">
    <div class="${cls}-pg" style="position:absolute;inset:0;transform-origin:left center;">
      <div style="position:absolute;inset:0;transform:rotate(${r(tilt)}deg);background:${th.parchment};border:1px solid ${th.edge};border-radius:${Q(14)};box-shadow:0 ${Q(18)} ${Q(44)} ${rgba(INK, 0.12)};overflow:hidden;">${inner}</div>
    </div>
  </div>`;
}
const cardTw = (cls, ctx, at, { turn = false } = {}) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.18)},ease:"none"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}",{y:"${Q(30)}"},{y:0,duration:${ctx.du(0.7)},ease:"power2.out"},${ctx.at(at)});`,
  // "At least one scene should turn a page-card in 3D — rotationY -100 -> 0 like a page opening."
  // The perspective lives on the PARENT (`.cls`), because a transformed layer cannot supply its
  // own vanishing point and would flatten into a horizontal squash.
  turn ? `tl.fromTo(".${cls}-pg",{rotationY:-100},{rotationY:0,duration:${ctx.du(1.05)},ease:"power2.out"},${ctx.at(at)});` : "",
].filter(Boolean);

// "Photos are MEMORIES … with a warm linen scrim (15-25%) so their colors sink into the paper."
const scrim = () => `<div style="position:absolute;inset:0;background:linear-gradient(180deg, ${rgba(LINEN, 0.24)} 0%, ${rgba(LINEN, 0.13)} 55%, ${rgba(TERRA, 0.1)} 100%);"></div>`;

// A WRAPPED PARAGRAPH'S HEIGHT, measured the only way this file can measure it: characters times
// mean advance over the measure. Law 6 is not only about headlines — a FIXED gap under a body
// paragraph collides the instant the copy runs one line longer, and the opening beat's 190-char
// subtext runs to four lines while the gap under it was authored for two.
const flowH = (text, size, width, adv = K.ADVANCE.mixed, lh = 1.6) =>
  (text ? Math.max(1, Math.ceil((String(text).length * adv * size) / Math.max(1, width))) * size * lh : 0);

// Every builder's pictureless exit goes through here, so no beat can degrade into an empty frame
// and every beat still carries the paper sky and the chapter chip.
function told(scene, ctx, { centred = false } = {}) {
  const b = K.statement(scene, ctx, { centred });
  return { ...b, backdrop: page(ctx.id, ctx.th, ctx.role), chrome: storyChrome(ctx), s: [...(b.s || []), ...pageTweens(ctx.id, ctx)] };
}

// ---- scenes ------------------------------------------------------------------
// ONCE — the opening page. Chapter chip (in the chrome), one line of story at heading-xl scale
// drifting up off the paper, the terracotta wash blooming top-left, planes crossing slowly.
// No picture by design: the film's imagery is spent on the journey and the keepsakes, and FRAME's
// OPENING is type on paper.
function sOnce(scene, ctx) {
  const { id, th, at } = ctx;
  const raw = String(scene.headline || scene.title || ctx.title || "").trim();
  const head = K.fitLines(raw, U(1180) / K.camSafe(), U(104), 3, th.adv);
  const body = String(scene.subtext || scene.body || "").trim().slice(0, 190);
  if (!head.lines.length && !body) return told(scene, ctx);
  const key = K.clampWords(String(scene.emphasis || "").trim(), 20);
  const top = U(300);
  const bodyY = top + head.lines.length * head.size * 1.14 + U(46);
  const keyY = bodyY + (body ? flowH(body, U(28), U(840), th.adv) + U(40) : U(16));
  return {
    backdrop: page(id, th, ctx.role),
    chrome: storyChrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(top)}cqw;width:${Q(1180)};z-index:4;">
      ${driftLines(id, th, head.lines, head.size, "hd")}
    </div>
    ${body ? `<div class="${id}-bd" style="position:absolute;left:${r(M)}cqw;top:${r(bodyY)}cqw;width:${Q(840)};font-family:${th.bodyStack};font-weight:400;font-size:${Q(28)};line-height:1.6;color:${th.sub};opacity:0;">${esc(body)}</div>` : ""}
    ${key ? `<div class="${id}-ky" style="position:absolute;left:${r(M)}cqw;top:${r(keyY)}cqw;font-family:${th.displayStack};font-weight:700;font-size:${Q(40)};color:${th.ink};opacity:0;">${underlined(id, th, key, U(40), "ul")}</div>` : ""}`,
    s: [
      ...(head.lines.length ? driftTw(id, ctx, "hd", 0.24, { dy: 42, dur: 0.72 }) : []),
      body ? `tl.fromTo(".${id}-bd",{opacity:0,y:"${Q(26)}"},{opacity:1,y:0,duration:${ctx.du(0.6)},ease:"power2.out"},${at(0.66)});` : "",
      key ? `tl.fromTo(".${id}-ky",{opacity:0,y:"${Q(20)}"},{opacity:1,y:0,duration:${ctx.du(0.5)},ease:"power2.out"},${at(0.92)});` : "",
      ...(key ? underlineTw(id, ctx, "ul", 1.12) : []),
      ...pageTweens(id, ctx),
    ].filter(Boolean),
  };
}

// JOURNEY — the manifest's widest slot (1728x410, cover). At that ratio a picture is a STRIP
// across the page, not a card sitting in the middle of it: a pasted-in photograph running the
// full measure. The first strip is the film's PAGE TURN — it opens in 3D from its left edge.
function sJourney(scene, ctx, shots) {
  const { id, th } = ctx;
  const pics = (shots || []).filter((sh) => sh && sh.path);
  const n = Math.min(2, pics.length);
  if (!n) return told(scene, ctx);
  const head = K.fitLines(String(scene.headline || scene.title || "").trim(), U(1180) / K.camSafe(), U(66), 2, th.adv);
  // MEASURE, DO NOT GUESS: a fixed band that suited one line runs straight under two.
  const bandTop = TOP + head.lines.length * head.size * 1.16 + U(44);
  const gap = U(30);
  const h = n === 2 ? (FOOT - bandTop - gap) / 2 : FOOT - bandTop;
  return {
    backdrop: page(id, th, ctx.role),
    chrome: storyChrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(TOP)}cqw;width:${Q(1180)};z-index:4;">
      ${driftLines(id, th, head.lines, head.size, "hd")}
    </div>
    ${Array.from({ length: n }, (_, i) => pageCard(`${id}-c${i}`, th, {
      x: M, y: bandTop + i * (h + gap), w: COL, h, tilt: i % 2 ? 1.4 : -1.6,
      inner: `${K.shotFill(pics[i], { bg: th.linen, w: COL, h })}${scrim()}`,
    })).join("")}`,
    s: [
      ...(head.lines.length ? driftTw(id, ctx, "hd", 0.16) : []),
      ...Array.from({ length: n }, (_, i) => cardTw(`${id}-c${i}`, ctx, 0.44 + i * 0.22, { turn: i === 0 })).flat(),
      ...pageTweens(id, ctx),
    ],
  };
}

// PASSAGE — the illustrated page: ONE sentence of story at heading scale on the left (a quote if
// the beat has one, which is what a storybook passage IS), its verses ruled beneath it, and the
// manifest's `contain` illustration (998x367) plated on the right. The plate is GATED on the
// picture: without it the passage simply takes the full measure, which is a complete page rather
// than a page with a hole in it.
function sPassage(scene, ctx, shots) {
  const { id, th, at } = ctx;
  const shot = (shots || []).find((sh) => sh && sh.path) || null;
  const quote = String(scene.quote || "").trim();
  // THE HEADLINE IS THE STORY LINE when the beat has no quote. Preferring `subtext` here threw the
  // authored headline away on any beat that had both — the verses below already carry the detail.
  const line = (quote || scene.headline || scene.subtext || scene.title || "").trim().slice(0, 240);
  const verses = K.bullets(scene, 3);
  if (!line && !verses.length) return told(scene, ctx);
  const by = quote ? String(scene.attribution || scene.emphasis || "").trim().slice(0, 60) : "";
  const colW = shot ? U(820) : U(1400);
  // The ceiling is heading-lg, not heading-md, ON PURPOSE. fitLines accepts the first line count
  // that keeps the type above 62% of the CEILING, so a low ceiling makes a long quote settle into
  // two cramped lines at 33px; raising it pushes the same words into three lines at 47px, which is
  // the scale FRAME asks a passage to carry.
  const fit = K.fitLines(line, colW / K.camSafe(), U(58), 4, th.adv);
  const top = U(280);
  const markH = quote ? U(66) : 0;
  const versesY = top + markH + fit.lines.length * fit.size * 1.34 + (by ? U(74) : U(40));
  const rowH = verses.length ? Math.max(U(74), (FOOT - versesY) / verses.length) : 0;
  const plateW = U(720), plateH = plateW / (998 / 367);
  return {
    backdrop: page(id, th, ctx.role),
    chrome: storyChrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(top)}cqw;width:${r(colW)}cqw;z-index:4;">
      ${quote ? `<div class="${id}-qm" style="font-family:${th.displayStack};font-weight:700;font-size:${Q(92)};line-height:0.6;color:${rgba(TERRA, 0.34)};opacity:0;">&ldquo;</div>` : ""}
      ${driftLines(id, th, fit.lines, fit.size, "ps", { lh: 1.34, weight: quote ? 400 : 700 })}
      ${by ? `<div class="${id}-by" style="margin-top:${Q(30)};opacity:0;">${micro(th, by)}</div>` : ""}
    </div>
    ${verses.map((v, i) => `<div class="${id}-vs" style="position:absolute;left:${r(M)}cqw;top:${r(versesY + i * rowH)}cqw;width:${r(colW)}cqw;height:${r(rowH)}cqw;display:flex;align-items:center;gap:${Q(20)};border-top:1px solid ${th.edge};opacity:0;">
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${Q(26)};color:${th.accent};flex:0 0 auto;">${K.pad2(i + 1)}</span>
      <span style="font-family:${th.bodyStack};font-weight:400;font-size:${Q(29)};line-height:1.4;color:${th.ink};">${esc(String(v).slice(0, 78))}</span>
    </div>`).join("")}
    ${shot ? pageCard(`${id}-pl`, th, {
      x: U(1920) - M - plateW, y: U(340), w: plateW, h: plateH, tilt: 2,
      // objectFit:"contain" from the manifest. K has exactly ONE media helper (shotFill) and it
      // crops, so the contained case is written out — inset against the card, which is positioned,
      // so the illustration sits ON the plate instead of escaping it.
      inner: `<div style="position:absolute;inset:${Q(18)};"><img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;"></div>`,
    }) : ""}`,
    s: [
      quote ? `tl.fromTo(".${id}-qm",{opacity:0,y:"${Q(18)}"},{opacity:1,y:0,duration:${ctx.du(0.5)},ease:"power2.out"},${at(0.14)});` : "",
      ...(fit.lines.length ? driftTw(id, ctx, "ps", 0.24, { dy: 30 }) : []),
      by ? `tl.fromTo(".${id}-by",{opacity:0},{opacity:1,duration:${ctx.du(0.4)},ease:"none"},${at(0.86)});` : "",
      verses.length ? `tl.fromTo(".${id}-vs",{opacity:0,x:"${Q(-26)}"},{opacity:1,x:0,duration:${ctx.du(0.52)},ease:"power2.out",stagger:${ctx.du(0.2)}},${at(0.72)});` : "",
      ...(shot ? cardTw(`${id}-pl`, ctx, 0.4) : []),
      ...pageTweens(id, ctx),
    ].filter(Boolean),
  };
}

// THE TURN — the ONE beat that prints figures as figures. FRAME: "the number in terracotta
// stat-number scale with 'the turn' chapter-chip; dusk wash cools the scene." Each figure sits on
// its own page-card, tilted the other way from its neighbour, like three pressed tickets.
function sTurn(scene, ctx) {
  const { id, th } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return told(scene, ctx);
  const raw = String(scene.headline || scene.title || "").trim();
  const head = K.fitLines(raw, U(1180) / K.camSafe(), U(56), 2, th.adv);
  const cardsY = TOP + (head.lines.length ? head.lines.length * head.size * 1.16 + U(70) : U(40));
  const h = Math.min(U(380), FOOT - cardsY - U(20));
  const gap = U(40);
  const w = (COL - gap * (stats.length - 1)) / stats.length;
  return {
    backdrop: page(id, th, ctx.role),
    chrome: storyChrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(TOP)}cqw;width:${Q(1180)};z-index:4;">
      ${driftLines(id, th, head.lines, head.size, "hd")}
    </div>
    ${stats.map((st, i) => pageCard(`${id}-f${i}`, th, {
      x: M + i * (w + gap), y: cardsY, w, h, tilt: i % 2 ? 1.6 : -1.8,
      inner: `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Q(22)};padding:${Q(30)};box-sizing:border-box;">
        <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(K.fitOne(`${st.v}${st.suffix}`, w - U(80), U(96), th.adv))}cqw;line-height:1;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="text-align:center;">${micro(th, K.statLabel(scene, i), rgba(INK, 0.6))}</div>
      </div>`,
    })).join("")}`,
    s: [
      ...(head.lines.length ? driftTw(id, ctx, "hd", 0.16) : []),
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          ...cardTw(`${id}-f${i}`, ctx, 0.4 + i * 0.16),
          // The counter is the manifest's `data: "counter-tick"` cue, on the beat that earns it.
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${ctx.du(0.68)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${ctx.at(0.54 + i * 0.16)});`,
        ];
      }),
      ...pageTweens(id, ctx),
    ],
  };
}

// KEEPSAKE — the manifest's `context` slot is 826x162, a 5.1:1 letterbox: two narrow memories
// pressed side by side on the page, each with a hand-written caption under it. Only as many cards
// as there are pictures are ever drawn.
function sKeepsake(scene, ctx, shots) {
  const { id, th, at } = ctx;
  const pics = (shots || []).filter((sh) => sh && sh.path);
  const n = Math.min(2, pics.length);
  if (!n) return told(scene, ctx);
  const head = K.fitLines(String(scene.headline || scene.title || "").trim(), U(1180) / K.camSafe(), U(62), 2, th.adv);
  const rowY = TOP + (head.lines.length ? head.lines.length * head.size * 1.16 + U(52) : U(30));
  const gap = U(60);
  const w = (COL - gap * (n - 1)) / n;
  const h = w / (826 / 162);
  const capY = rowY + h + U(28);
  const caps = K.bullets(scene, 2);
  const tail = String(scene.subtext || scene.body || "").trim().slice(0, 150);
  const capText = Array.from({ length: n }, (_, i) => String(caps[i] || (i === 0 ? tail : "") || "").slice(0, 64));
  const hasCaps = capText.some(Boolean);
  // Two lines of caption is possible at this measure, so the paragraph below clears the taller case.
  const tailY = capY + (hasCaps ? U(84) : U(20));
  const key = K.clampWords(String(scene.emphasis || "").trim(), 20);
  const keyY = tailY + flowH(tail, U(28), U(1000), th.adv) + U(40);
  return {
    backdrop: page(id, th, ctx.role),
    chrome: storyChrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(TOP)}cqw;width:${Q(1180)};z-index:4;">
      ${driftLines(id, th, head.lines, head.size, "hd")}
    </div>
    ${Array.from({ length: n }, (_, i) => pageCard(`${id}-k${i}`, th, {
      x: M + i * (w + gap), y: rowY, w, h, tilt: i % 2 ? 2.2 : -2.4,
      inner: `${K.shotFill(pics[i], { bg: th.linen, w, h })}${scrim()}`,
    })).join("")}
    ${capText.map((c, i) => (c ? `<div class="${id}-cp" style="position:absolute;left:${r(M + i * (w + gap))}cqw;top:${r(capY)}cqw;width:${r(w)}cqw;font-family:${th.bodyStack};font-weight:700;font-size:${Q(26)};line-height:1.3;color:${th.ink};opacity:0;">${esc(c)}</div>` : "")).join("")}
    ${tail && n > 1 ? `<div class="${id}-tl" style="position:absolute;left:${r(M)}cqw;top:${r(tailY)}cqw;width:${Q(1000)};font-family:${th.bodyStack};font-weight:400;font-size:${Q(28)};line-height:1.6;color:${th.sub};opacity:0;">${esc(tail)}</div>` : ""}
    ${key && n > 1 ? `<div class="${id}-ky" style="position:absolute;left:${r(M)}cqw;top:${r(keyY)}cqw;font-family:${th.displayStack};font-weight:700;font-size:${Q(36)};color:${th.ink};opacity:0;">${underlined(id, th, key, U(36), "ul")}</div>` : ""}`,
    s: [
      ...(head.lines.length ? driftTw(id, ctx, "hd", 0.16) : []),
      ...Array.from({ length: n }, (_, i) => cardTw(`${id}-k${i}`, ctx, 0.4 + i * 0.2)).flat(),
      hasCaps ? `tl.fromTo(".${id}-cp",{opacity:0,y:"${Q(18)}"},{opacity:1,y:0,duration:${ctx.du(0.46)},ease:"power2.out",stagger:${ctx.du(0.16)}},${at(0.86)});` : "",
      tail && n > 1 ? `tl.fromTo(".${id}-tl",{opacity:0,y:"${Q(22)}"},{opacity:1,y:0,duration:${ctx.du(0.54)},ease:"power2.out"},${at(1.04)});` : "",
      key && n > 1 ? `tl.fromTo(".${id}-ky",{opacity:0},{opacity:1,duration:${ctx.du(0.36)},ease:"none"},${at(1.24)});` : "",
      ...(key && n > 1 ? underlineTw(id, ctx, "ul", 1.36) : []),
      ...pageTweens(id, ctx),
    ].filter(Boolean),
  };
}

// EVER AFTER — the closing page. FRAME: "centered heading-lg closing line + honey firefly cluster
// settling; everything slows to stillness." The settling is real and it is in pageTweens: on the
// last beat every drift halves its amplitude and stretches its period. NO second honey element is
// added here — the firefly field IS the cluster (rule 3), and the call to action takes the
// terracotta underline instead of a button, because this pack does not have buttons.
function sAfter(scene, ctx, logo) {
  const { id, th, at } = ctx;
  const head = K.fitLines(String(scene.headline || scene.emphasis || ctx.title || "").trim(), U(1280) / K.camSafe(), U(80), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || "").trim(), 24) || ctx.S.go || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  const top = U(330);
  const actY = top + (hasMark ? U(150) : 0) + head.lines.length * head.size * 1.16 + U(56);
  return {
    backdrop: page(id, th, ctx.role),
    chrome: storyChrome(ctx),
    html: `
    <div style="position:absolute;left:0;right:0;top:${r(top)}cqw;text-align:center;z-index:4;">
      ${hasMark ? `<div class="${id}-lg" style="width:${Q(112)};height:${Q(112)};margin:0 auto ${Q(38)};background:${th.parchment};border:1px solid ${th.edge};border-radius:${Q(14)};box-shadow:0 ${Q(14)} ${Q(34)} ${rgba(INK, 0.12)};display:flex;align-items:center;justify-content:center;padding:${Q(18)};box-sizing:border-box;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      ${driftLines(id, th, head.lines, head.size, "hd", { lh: 1.16 })}
    </div>
    <div class="${id}-ac" style="position:absolute;left:0;right:0;top:${r(actY)}cqw;text-align:center;font-family:${th.displayStack};font-weight:700;font-size:${Q(44)};color:${th.ink};z-index:4;opacity:0;">${underlined(id, th, action, U(44), "ul")}</div>
    <div class="${id}-ur" style="position:absolute;left:0;right:0;top:${r(actY + U(112))}cqw;text-align:center;z-index:4;opacity:0;">${micro(th, ctx.url, rgba(INK, 0.55))}</div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-lg",{opacity:0,y:"${Q(26)}"},{opacity:1,y:0,duration:${ctx.du(0.6)},ease:"power2.out"},${at(0.18)});` : "",
      ...(head.lines.length ? driftTw(id, ctx, "hd", 0.36, { dy: 34, dur: 0.8, stagger: 0.2 }) : []),
      `tl.fromTo(".${id}-ac",{opacity:0,y:"${Q(22)}"},{opacity:1,y:0,duration:${ctx.du(0.6)},ease:"power2.out"},${at(1.0)});`,
      ...underlineTw(id, ctx, "ul", 1.24),
      `tl.fromTo(".${id}-ur",{opacity:0},{opacity:1,duration:${ctx.du(0.44)},ease:"none"},${at(1.4)});`,
      ...pageTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "once", last: "after",
  // `passage` sits early among the middles: it needs no picture budget (its plate is optional),
  // so an asset-poor film still shows a designed page instead of the kit's statement.
  middle: ["journey", "passage", "turn", "keepsake"],
  shapes: {
    // The manifest's own slot geometry. `feature` and `proof` are the same 1728x410 letterbox, so
    // `journey` covers both; `passage` takes `how` (998x367, contain); `keepsake` takes `context`
    // (826x162). `turn` prints figures, never pictures.
    once: [], journey: [1728 / 410, 1728 / 410], passage: [998 / 367],
    keepsake: [826 / 162, 826 / 162], turn: [], after: [],
    statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "journey" || role === "keepsake" ? Math.min(2, Math.max(0, budget))
    : role === "passage" ? Math.min(1, Math.max(0, budget)) : 0),
  needs: (role) => (role === "journey" || role === "keepsake" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    const isQuote = !!String(scene.quote || "").trim();
    if (role === "turn") return isStats;
    if (isStats) return false;                        // only `turn` prints figures as figures
    if (role === "passage") return isQuote || K.bullets(scene, 3).length >= 2;
    // ...and only `passage` prints a quote. Roles are picked by a ROTATING cursor, so without this
    // the quote beat was taken by whichever layout came next in the rotation — observed live:
    // `keepsake` claimed it, drew two photographs, and the quote itself was never printed.
    if (isQuote) return false;
    if (role === "journey" || role === "keepsake") return budget >= 1;
    return true;
  },
};
const BUILDERS = {
  once: sOnce, journey: sJourney, passage: sPassage, turn: sTurn, keepsake: sKeepsake, after: sAfter,
  statement: (sc, ctx) => told(sc, ctx),
  "statement-c": (sc, ctx) => told(sc, ctx, { centred: true }),
};
const LABELS = {
  once: STRINGS.once, journey: STRINGS.journey, passage: STRINGS.passage,
  turn: STRINGS.turn, keepsake: STRINGS.keepsake, after: STRINGS.after,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:1px solid ${th.edge}; border-radius:${Q(12)}; }
  /* Spectral bundles 400 and 700 only — the kit's 600 would be a synthesised faux-bold. */
  #cap-text { font-weight:700; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css,
    // A storybook beat is a long one: the reference beat is the top of the allowed range, so a
    // 4s scene still gets its full drift rather than a hurried one.
    refBeat: 4.8,
    // `motion.drift: 1.035` from the manifest, and the gentlest push in the library.
    camera: { push: 80, scale: 1.035 },
    signature: "organic", fallbackBrand: "FABLE",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
