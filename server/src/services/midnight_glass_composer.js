// MIDNIGHT GLASS — a dark-glassmorphism display system. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. NOT a port: there is no Claude Design reference for this pack. It is written from its
// own manifest, frames/midnight-glass/pack.json, which is the only brief that exists for it. The pack
// had no composer, so every film that selected it rendered through the GENERIC scene kit wearing its
// palette — the design below has never existed in code before this file.
//
// THE BRIEF, in its own words:
//
//   "dark glassmorphism: deep navy, frosted cards, one neon accent — premium, technical, nocturnal"
//
//   surface.ground #060918 · motion.cut "panel" · motion.drift 1.05 · fx.canvas "flow"
//   textfx.enter "mask-reveal" · textfx.emphasis "glow" · textfx.align "left"
//
// THE RULES, derived from that brief and enforced everywhere below:
//
//   1. GLASS IS THE ONLY CONTAINER. Every card, strip, tile and plinth is ONE piece of furniture —
//      `pane()`: a low-alpha white fill, a frost hairline, a lit top edge and a specular streak that
//      keeps travelling across it. Nothing in this pack is drawn a second way. `surface.flat` is
//      false, so glass may carry depth: a drop shadow, an inset highlight and a faint neon rim.
//   2. TWO LIGHTS, ONE ACCENT. The ground is lit by the neon accent (upper right) and by its violet
//      counter-hue (lower left). Only ONE of them is ever an accent on content — the violet is light,
//      never ink. `textfx.emphasis: "glow"` is a halo behind a word, not a second colour scheme.
//   3. THE CUT IS A PANEL. `motion.cut: "panel"` read literally: content arrives ON a glass panel
//      that wipes open from its leading edge, and the panel's bright edge crosses the whole frame
//      once per beat (the pack's `light-sweep` sfx cue made visible). Type is never faded in —
//      `textfx.enter: "mask-reveal"` means every line is uncovered by its own clip-path.
//   4. NOCTURNAL, AND THEREFORE TECHNICAL. `fx.canvas: "flow"` is a current: a faint 96px instrument
//      grid creeping under everything, with light packets running across it on seven lanes. Labels
//      are JetBrains Mono caps. The frame wears a glass bezel with corner registration ticks.
//   5. THE MANIFEST'S SLOTS ARE THE LAYOUTS. 1728x410 and 826x162 are not cards, they are STRIPS —
//      so `panels` spans the measure and `ribbon` lays TWO 826-wide strips side by side, which with
//      a 28px gutter comes to exactly the 1680 column. The geometry is read off the brief, not
//      invented and then justified.
//
// FONT SUBSTITUTION: `Inter` is NOT bundled (verified with pack_fonts.isBundled), so Figtree stands
// in for the body voice — the nearest neutral UI grotesque in src/fonts/pack_fonts.js. Space Grotesk
// (the manifest's `typography.display`) and JetBrains Mono are bundled and used as specified.
//
// WHY THERE IS NO BLUR ANYWHERE IN A GLASSMORPHISM PACK: `backdrop-filter` and `filter: blur()` are
// the one thing this design would reach for first and the one thing that cannot be used. A per-scene
// stack of blurred layers makes a SEEKED capture come back solid black, which is how a delivered film
// gets QA-blocked with no local repro. Every "frosted", "glow", "haze" and "bloom" here is a
// low-alpha fill or a radial-gradient. Do not "fix" this back.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

// The manifest's palette, verbatim. Its seventh colour, the violet #7A5CFF, is NOT a constant here:
// it is derived from the accent in theme() so that a rebranded film still gets a second light.
const ABYSS = "#060918", MIDNIGHT = "#0A0F2A", GLASS = "#FFFFFF";
const FROST = "#C7D6F0", INK = "#EAF2FF", NEON = "#00F0FF";
const DISPLAY = "Space Grotesk", MONO = "JetBrains Mono", BODY = "Figtree";

const STRINGS = {
  open: "INTRODUCING", panels: "CAPABILITY", readout: "TELEMETRY", stack: "HOW IT WORKS",
  ribbon: "IN CONTEXT", signoff: "GET STARTED", scene: "PANEL", of: "OF", go: "START FREE",
  fig: "FIG",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: ABYSS, isDark: true, packAccent: NEON });
  // The manifest names a violet as well as a neon. It is derived as a ROTATION of the accent, so a
  // rebranded film is still lit by two lights that belong to each other instead of one branded hue
  // and one stock purple. #00F0FF is hsl(183 100% 50%) and #7A5CFF is hsl(251 100% 68%), so the
  // rotation is +68 degrees of hue and +0.18 of LIGHTNESS.
  //
  // spin(hex, deg, dl, minS) — the third argument is a lightness DELTA and the fourth is a
  // saturation FLOOR, not a lightness target. Passing 0.68 in slot four (which reads like the
  // violet's lightness) returned #3100FF, a pure blue: the pack's second light was the wrong colour
  // and nothing would have failed for it. Verified against om_port_kit.spin, not against the name.
  const counter = K.spin(accent, 68, 0.18);
  return {
    accent,
    // transition_kit reads accent2 for its seams and light bars, so the cuts are lit by the same pair.
    accent2: counter, counter,
    bg: ABYSS, mid: MIDNIGHT, ink: INK, paper: MIDNIGHT,
    panel: rgba(GLASS, 0.06), glass: rgba(GLASS, 0.06),
    sub: FROST, line: rgba(FROST, 0.18), halo: rgba(accent, 0.5),
    adv: K.ADVANCE.mixed,
    // capBg must stay a HEX: baseCss runs it through rgba(), which parses hex only.
    capBg: MIDNIGHT, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- the measure -------------------------------------------------------------
// 1680 is not a round number chosen for taste: it is 826 + 28 + 826, so the manifest's two
// `context` ribbons fill the column edge to edge with one gutter between them.
const M = U(120), COL = U(1920) - M * 2;
// NOTHING IS DRAWN BELOW THIS. The rail sits at 1034 and the caption node's pill floats just above
// it; a strip that reaches the frame edge covers both.
const FOOT = U(930);

// ---- the nocturne ------------------------------------------------------------
// `fx.canvas: "flow"` — a current running under the glass. Seven light packets on golden-ratio
// spaced lanes, so no two ever share a line, and each with its own speed.
const PACKETS = Array.from({ length: 7 }, (_, i) => {
  const a = (i * 0.6180339887) % 1;
  const b = ((i + 1) * 0.3819660113) % 1;
  return { y: 5 + a * 88, w: 200 + b * 300, dur: 3.4 + a * 3.6, lead: b * 0.8, hue: i % 3 };
});

// A round-ish bloom needs its two radii computed SEPARATELY, because percentages resolve against the
// box's own width and height. `circle <pct>%` is invalid CSS and silently drops the entire
// comma-joined background — it has cost this library three packs.
const bloom = (c, sx, sy, x, y, o) =>
  `radial-gradient(ellipse ${r((sx / 1920) * 100)}% ${r((sy / 1080) * 100)}% at ${r(x)}% ${r(y)}%, ${rgba(c, o)} 0%, ${rgba(c, 0)} 72%)`;

// The current REVERSES on alternate beats. Without it every scene ran the identical seven lanes in
// the identical direction, and an eight-beat film performs one ambient gesture eight times — the same
// complaint that got the shared cut vocabulary built in the first place. The bright end of each packet
// is always its leading edge, so the gradient turns with the travel.
const flowDir = (i) => ((i || 0) % 2 ? -1 : 1);

function night(id, th, i = 0, extra = "") {
  const dir = flowDir(i);
  const packets = PACKETS.map((p, k) => {
    const c = [th.accent, th.counter, FROST][p.hue];
    const x0 = dir > 0 ? -U(p.w) : U(1920);
    return `<div class="${id}-pk${k}" style="position:absolute;left:${r(x0)}cqw;top:${r((p.y / 100) * VH)}cqw;width:${r(U(p.w))}cqw;height:${r(U(2))}cqw;background:linear-gradient(${dir > 0 ? 90 : 270}deg, ${rgba(c, 0)} 0%, ${rgba(c, 0.42)} 66%, ${rgba(GLASS, 0.62)} 100%);"></div>`;
  }).join("");
  return `<div style="position:absolute;inset:0;background:linear-gradient(166deg, ${th.mid} 0%, ${th.bg} 58%, #04060F 100%);overflow:hidden;">
    <div class="${id}-gx" style="position:absolute;inset:${r(-U(140))}cqw;background-image:linear-gradient(90deg, ${rgba(FROST, 0.05)} 1px, transparent 1px);background-size:${r(U(96))}cqw 100%;">
      <div class="${id}-gy" style="position:absolute;inset:0;background-image:linear-gradient(${rgba(FROST, 0.035)} 1px, transparent 1px);background-size:100% ${r(U(96))}cqw;"></div>
    </div>
    <div class="${id}-g1" style="position:absolute;inset:${r(-U(220))}cqw;background:${bloom(th.accent, 900, 760, 82, 14, 0.2)},${bloom(th.accent, 520, 460, 64, 42, 0.09)};"></div>
    <div class="${id}-g2" style="position:absolute;inset:${r(-U(200))}cqw;background:${bloom(th.counter, 880, 720, 14, 88, 0.22)};"></div>
    <div style="position:absolute;inset:0;overflow:hidden;">${packets}</div>
    <div class="${id}-sw" style="position:absolute;left:${r(-U(460))}cqw;top:0;width:${r(U(460))}cqw;height:100%;background:linear-gradient(100deg, ${rgba(th.accent, 0)} 0%, ${rgba(th.accent, 0.1)} 46%, ${rgba(GLASS, 0.07)} 64%, ${rgba(th.accent, 0)} 100%);border-right:1px solid ${rgba(th.accent, 0.42)};"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 74% 74% at 50% 48%, transparent 34%, ${rgba("#000000", 0.52)} 100%);"></div>
    ${extra}
  </div>`;
}

// Every ambient loop is a REPEATING TWEEN, because the renderer seeks one paused timeline and there
// is no per-frame clock to read. The grid translates by EXACTLY one 96px cell, so the wrap is
// invisible; the two blooms yoyo, which is a sine wave by another name.
function nightTweens(id, ctx) {
  const gx = Math.max(9, ctx.L * 2.2), gy = Math.max(13, ctx.L * 3.1);
  const b1 = Math.max(7, ctx.L * 1.9), b2 = Math.max(8, ctx.L * 2.3);
  return [
    `tl.fromTo(".${id}-gx",{x:0},{x:"${r(U(96))}cqw",duration:${r(gx)},ease:"none",repeat:${K.reps(ctx.L, gx)}},${r(ctx.T)});`,
    `tl.fromTo(".${id}-gy",{y:0},{y:"${r(U(96))}cqw",duration:${r(gy)},ease:"none",repeat:${K.reps(ctx.L, gy)}},${r(ctx.T)});`,
    `tl.to(".${id}-g1",{x:"${r(-U(90))}cqw",y:"${r(U(54))}cqw",duration:${r(b1)},ease:"sine.inOut",repeat:${K.reps(ctx.L, b1)},yoyo:true},${r(ctx.T)});`,
    `tl.to(".${id}-g2",{x:"${r(U(74))}cqw",y:"${r(-U(46))}cqw",duration:${r(b2)},ease:"sine.inOut",repeat:${K.reps(ctx.L, b2)},yoyo:true},${r(ctx.T)});`,
    // THE PANEL EDGE. One crossing per beat: the leading edge of the glass the scene arrives on.
    `tl.fromTo(".${id}-sw",{x:0},{x:"${r(U(2380))}cqw",duration:${ctx.du(0.62)},ease:"power2.inOut"},${ctx.at(0)});`,
    ...PACKETS.map((p, k) =>
      `tl.fromTo(".${id}-pk${k}",{x:0},{x:"${r(flowDir(ctx.i) * U(1920 + p.w))}cqw",duration:${r(p.dur)},ease:"none",repeat:${K.reps(Math.max(0.2, ctx.L - p.lead), p.dur)}},${r(ctx.T + p.lead)});`),
  ];
}

// ---- chrome ------------------------------------------------------------------
// THIS PACK OWNS ITS CHROME, and it owns it for a design reason rather than a colour one: the bezel
// is the edge of a lit display, so it must NOT ride the cut. The kit renders chrome outside .om-cam,
// which is exactly where a bezel belongs — the panels move behind it and the glass frame holds still.
// Supplying chrome also means the kit stops emitting its own progress tween (it would target a
// `.sN-prog` that no longer exists), so the rail below carries the film-wide fill itself.
function hud(ctx) {
  const { th, id, i, total } = ctx;
  const S = ctx.S || STRINGS;
  const brand = String(ctx.brand || "").slice(0, 22);
  const bz = U(26), off = U(40), arm = U(26);
  // Registration ticks at the four corners — the "technical" half of the brief, drawn once.
  const tick = (h, v) => `<div style="position:absolute;${h}:${r(off)}cqw;${v}:${r(off)}cqw;width:${r(arm)}cqw;height:1px;background:${rgba(th.accent, 0.42)};"></div>
    <div style="position:absolute;${h}:${r(off)}cqw;${v}:${r(off)}cqw;width:1px;height:${r(arm)}cqw;background:${rgba(th.accent, 0.42)};"></div>`;
  return `<div class="om-chrome">
    <div style="position:absolute;inset:${r(bz)}cqw;border:1px solid ${rgba(FROST, 0.1)};border-radius:${r(U(22))}cqw;"></div>
    <div style="position:absolute;left:${r(bz)}cqw;right:${r(bz)}cqw;top:${r(bz)}cqw;height:1px;background:linear-gradient(90deg, ${rgba(GLASS, 0)} 0%, ${rgba(GLASS, 0.36)} 20%, ${rgba(GLASS, 0.05)} 58%, ${rgba(GLASS, 0)} 100%);"></div>
    ${tick("left", "top")}${tick("right", "top")}${tick("left", "bottom")}${tick("right", "bottom")}
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(56))}cqw;display:flex;align-items:center;gap:${r(U(14))}cqw;">
      <span style="width:${r(U(11))}cqw;height:${r(U(11))}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${r(U(16))}cqw ${th.accent};flex:0 0 auto;"></span>
      <span style="font-family:${th.displayStack};font-weight:600;font-size:${r(U(24))}cqw;letter-spacing:0.05em;color:${th.ink};white-space:nowrap;">${esc(brand)}</span>
      ${ctx.label ? `<span style="font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.18em;text-transform:uppercase;color:${rgba(FROST, 0.68)};white-space:nowrap;">／ ${esc(ctx.label)}</span>` : ""}
    </div>
    <div style="position:absolute;right:${r(M)}cqw;top:${r(U(60))}cqw;font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.2em;color:${rgba(FROST, 0.6)};white-space:nowrap;">${esc(S.scene || STRINGS.scene)} ${K.pad2(i + 1)} ${esc(S.of || STRINGS.of)} ${K.pad2(total)}</div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;bottom:${r(U(46))}cqw;height:${r(U(3))}cqw;border-radius:${r(U(3))}cqw;background:${rgba(FROST, 0.14)};overflow:hidden;">
      <div class="${id}-rail" style="width:100%;height:100%;border-radius:${r(U(3))}cqw;background:${th.accent};box-shadow:0 0 ${r(U(14))}cqw ${rgba(th.accent, 0.7)};transform-origin:left center;"></div>
    </div>
  </div>`;
}
// The rail fills across the WHOLE film, so it is driven from the beat's place in the sequence. The
// start value is set BY the tween, never inline: a CSS transform and a GSAP scaleX both apply, and
// declaring it twice scales the bar twice.
const hudTweens = (id, ctx) => [
  `tl.fromTo(".${id}-rail",{scaleX:${r(ctx.total ? ctx.i / ctx.total : 0)}},{scaleX:${r(ctx.total ? (ctx.i + 1) / ctx.total : 1)},duration:${r(ctx.L)},ease:"none"},${r(ctx.T)});`,
];

// The two things EVERY beat wears, in one place, so no builder can forget either.
const ground = (ctx, extra = "") => ({ backdrop: night(ctx.id, ctx.th, ctx.i, extra), chrome: hud(ctx) });
const ambient = (ctx) => [...nightTweens(ctx.id, ctx), ...hudTweens(ctx.id, ctx)];
// A beat that cannot get what its layout needs returns the STATEMENT layout wearing this pack's
// ground and chrome — never its own layout with the picture removed, and never an empty container.
const dress = (built, ctx, extra = "") => ({
  ...built, ...ground(ctx, extra), s: [...(built.s || []), ...ambient(ctx)],
});

// ---- glass -------------------------------------------------------------------
// THE ONE CONTAINER IN THE PACK (rule 1). Never called without content: every caller gates on the
// picture, the figures or the copy that fills it.
function pane(cls, th, { x, y, w, h, inner, pad = 0, bar = "", radius = U(20), z = 4 }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(radius)}cqw;overflow:hidden;background:linear-gradient(152deg, ${rgba(GLASS, 0.09)} 0%, ${rgba(GLASS, 0.028)} 52%, ${rgba(th.counter, 0.06)} 100%);border:1px solid ${rgba(FROST, 0.18)};box-shadow:0 ${r(U(24))}cqw ${r(U(60))}cqw ${rgba("#000000", 0.45)}, 0 0 ${r(U(40))}cqw ${rgba(th.accent, 0.1)}, inset 0 1px 0 ${rgba(GLASS, 0.22)};opacity:0;">
    <div class="${cls}-rv" style="position:absolute;inset:0;display:flex;flex-direction:column;clip-path:inset(0 100% 0 0);">
      ${bar}
      <div style="position:relative;flex:1 1 auto;min-height:0;${pad ? `padding:${r(pad)}cqw;box-sizing:border-box;` : ""}">${inner}</div>
    </div>
    <div class="${cls}-sh" style="position:absolute;top:0;bottom:0;left:${r(-U(340))}cqw;width:${r(U(220))}cqw;pointer-events:none;">
      <div style="position:absolute;inset:${r(-U(90))}cqw 0;background:linear-gradient(100deg, transparent, ${rgba(GLASS, 0.13)}, transparent);transform:skewX(-14deg);"></div>
    </div>
  </div>`;
}
// `motion.cut: "panel"`. The glass slides the last few pixels into place while its contents WIPE OPEN
// from the leading edge; the specular streak then keeps crossing it for the rest of the beat, which is
// what makes the surface read as glass rather than as a grey rectangle.
//
// THE WIPE IS ON `-rv`, NOT ON THE PANE. A clip-path clips everything the element paints — including
// what it paints OUTSIDE its border box, which is both box-shadows: the drop shadow and the neon rim.
// Clipping the pane itself would have ended the tween at `inset(0 0 0 0)` and left the pack's entire
// depth budget clipped away for the rest of the beat, with nothing in the markup to show why.
//
// The skew lives on an inner div for the same family of reason: GSAP replaces the whole `transform`
// property, so a skew inlined on the tweened element is wiped by the first frame of its own sweep.
function paneTweens(cls, ctx, at, { from = "left" } = {}) {
  const shDur = Math.max(4.6, ctx.L * 1.4);
  const closed = from === "right" ? "inset(0 0 0 100%)" : from === "up" ? "inset(100% 0 0 0)" : "inset(0 100% 0 0)";
  const dx = from === "right" ? U(64) : from === "up" ? 0 : -U(64);
  const dy = from === "up" ? U(54) : 0;
  return [
    `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.1)},ease:"none"},${ctx.at(at)});`,
    `tl.fromTo(".${cls}-rv",{clipPath:"${closed}"},{clipPath:"inset(0 0 0 0)",duration:${ctx.du(0.32)},ease:"expo.out"},${ctx.at(at)});`,
    `tl.fromTo(".${cls}",{x:"${r(dx)}cqw",y:"${r(dy)}cqw"},{x:0,y:0,duration:${ctx.du(0.46)},ease:"expo.out"},${ctx.at(at)});`,
    `tl.fromTo(".${cls}-sh",{x:0},{x:"${r(U(2500))}cqw",duration:${r(shDur)},ease:"none",repeat:${K.reps(ctx.L, shDur)}},${ctx.at(at)});`,
  ];
}

// A glass WINDOW — the pack's "frosted card" holding a real picture, with the slim titlebar a
// nocturnal app wears. Returns "" without a picture: THE FIRST LAW, never draw an empty container.
// `bar` is suppressed on a short strip, because a 36px chrome bar inside a 220px letterbox eats the
// picture it was meant to frame.
function windowPane(cls, th, { x, y, w, h, shot, url = "", bar = true, contain = false, pad = U(22), radius = U(20) }) {
  if (!shot || !shot.path) return "";
  const bd = bar ? `<div style="flex:0 0 auto;height:${r(U(36))}cqw;display:flex;align-items:center;gap:${r(U(7))}cqw;padding:0 ${r(U(16))}cqw;border-bottom:1px solid ${rgba(FROST, 0.14)};background:${rgba(GLASS, 0.05)};">
      ${[0, 1, 2].map(() => `<span style="width:${r(U(9))}cqw;height:${r(U(9))}cqw;border-radius:50%;background:${rgba(FROST, 0.32)};flex:0 0 auto;"></span>`).join("")}
      ${url ? `<span style="margin-left:${r(U(12))}cqw;font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.08em;color:${rgba(FROST, 0.6)};white-space:nowrap;overflow:hidden;">${esc(url)}</span>` : ""}
    </div>` : "";
  // K has exactly ONE media helper and it CROPS. The manifest asks for objectFit:"contain" on the
  // `how` slots, so that case is written out by hand — inside a positioned wrapper, because
  // shotFill's `position:absolute;inset:0` would otherwise resolve against the padding box and
  // ignore the inset the illustration needs.
  const pic = contain
    ? `<div style="position:absolute;inset:${r(pad)}cqw;"><img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;"></div>`
    : K.shotFill(shot, { bg: th.mid, w, h });
  // `radius` is forwarded, not swallowed: the 826x162 ribbons ask for a tighter corner than a
  // full-height panel, and an option a caller passes and the callee drops is a lie in the markup.
  return pane(cls, th, { x, y, w, h, bar: bd, inner: pic, radius });
}

// ---- type --------------------------------------------------------------------
const display = (th, size, weight = 600, color = null) =>
  `font-family:${th.displayStack};font-weight:${weight};font-size:${r(size)}cqw;line-height:1.05;letter-spacing:-0.025em;color:${color || th.ink};`;

const label = (th, t, color = null, size = U(18)) =>
  `<span style="font-family:${th.monoStack};font-size:${r(size)}cqw;letter-spacing:0.22em;text-transform:uppercase;color:${color || rgba(FROST, 0.72)};white-space:nowrap;">${esc(t)}</span>`;

// `textfx.enter: "mask-reveal"` — each line is UNCOVERED by its own clip, never faded. A clip-path is
// a paint operation, so it stays off the layout path (scripts/test-motion-safety.js).
const mask = (id, lines, style, cls = "ln") =>
  lines.map((l) => `<span class="${id}-${cls}" style="display:block;${style}clip-path:inset(0 0 100% 0);">${esc(l)}</span>`).join("");
const maskTweens = (id, ctx, at, cls = "ln") => [
  `tl.to(".${id}-${cls}",{clipPath:"inset(0 0 0% 0)",duration:${ctx.du(0.34)},ease:"expo.out",stagger:${ctx.du(0.1)}},${ctx.at(at)});`,
];

// `textfx.emphasis: "glow"` — the accent word carries a halo that BREATHES. The halo is a
// radial-gradient sibling, not a blur filter, and one yoyo tween both reveals it and pulses it (two
// tweens on one property is a seek-order hazard, and an element revealed by nothing is a ghost).
const glowWord = (id, th, word, size, cls) =>
  `<span style="position:relative;display:inline-block;white-space:nowrap;color:${th.accent};text-shadow:0 0 ${r(U(30))}cqw ${rgba(th.accent, 0.5)};">
    <span class="${id}-${cls}" style="position:absolute;left:${r(-U(34))}cqw;right:${r(-U(34))}cqw;top:${r(-size * 0.4)}cqw;bottom:${r(-size * 0.4)}cqw;background:${bloom(th.accent, 900, 420, 50, 50, 0.3)};opacity:0;"></span>
    <span style="position:relative;">${esc(word)}</span>
  </span>`;
const glowTweens = (id, ctx, at, cls) => {
  const dur = Math.max(1.3, ctx.L * 0.3);
  return [`tl.fromTo(".${id}-${cls}",{opacity:0},{opacity:1,duration:${r(dur)},ease:"sine.inOut",repeat:${K.reps(Math.max(0.4, ctx.L * 0.8), dur)},yoyo:true},${ctx.at(at)});`];
};

const chip = (th, t) =>
  `<span class="mgc" style="display:inline-flex;align-items:center;gap:${r(U(10))}cqw;padding:${r(U(11))}cqw ${r(U(20))}cqw;border-radius:${r(U(100))}cqw;background:${rgba(GLASS, 0.06)};border:1px solid ${rgba(FROST, 0.18)};font-family:${th.bodyStack};font-weight:500;font-size:${r(U(21))}cqw;color:${th.ink};white-space:nowrap;opacity:0;"><span style="width:${r(U(8))}cqw;height:${r(U(8))}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${r(U(10))}cqw ${th.accent};flex:0 0 auto;"></span>${esc(t)}</span>`;

// The counter a figure tick-counts up on. `audio.sfxPalette.data` is "counter-tick"; this is it.
const countTween = (id, ctx, i, st, at) => {
  const num = Number(String(st.v).replace(/,/g, "")) || 0;
  const dp = String(st.v).includes(".") ? 1 : 0;
  return `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${ctx.du(0.5)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${ctx.at(at)});`;
};

// ---- scenes ------------------------------------------------------------------
// LOCKUP — the first beat. Left-aligned (`textfx.align: "left"`), the headline uncovered line by
// line, the emphasis glowing under it, and the hero capture in a glass window on the right.
function sLockup(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const S = ctx.S || STRINGS;
  const shot = (shots || []).filter((x) => x && x.path)[0] || null;
  const colW = shot ? U(860) : U(1420);
  const head = K.fitLines(String(scene.headline || scene.title || ctx.title || ""), colW / K.camSafe(), U(104), 3, th.adv);
  const body = String(scene.subtext || "").trim().slice(0, 160);
  const key = K.clampWords(String(scene.emphasis || "").trim(), 20);
  const chips = K.bullets(scene, 3).map((b) => String(b).slice(0, 22));
  return {
    ...ground(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(240))}cqw;width:${r(colW)}cqw;z-index:4;">
      <div class="${id}-eb" style="margin-bottom:${r(U(26))}cqw;opacity:0;">${label(th, String(scene.kicker || S.open || STRINGS.open).slice(0, 30), th.accent)}</div>
      ${head.lines.length ? mask(id, head.lines, display(th, head.size, 600)) : ""}
      ${key ? `<div class="${id}-key" style="margin-top:${r(U(28))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(U(40))}cqw;line-height:1.2;opacity:0;">${glowWord(id, th, key, U(40), "ha")}</div>` : ""}
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(28))}cqw;max-width:${r(Math.min(colW, U(760)))}cqw;font-family:${th.bodyStack};font-weight:400;font-size:${r(U(27))}cqw;line-height:1.55;color:${rgba(FROST, 0.86)};opacity:0;">${esc(body)}</div>` : ""}
      ${chips.length ? `<div style="margin-top:${r(U(30))}cqw;display:flex;gap:${r(U(14))}cqw;flex-wrap:wrap;">${chips.map((c) => chip(th, c)).join("")}</div>` : ""}
    </div>
    ${shot ? windowPane(`${id}-w`, th, { x: U(1040), y: U(280), w: U(760), h: U(430), shot, url: ctx.url }) : ""}`,
    s: [
      `tl.fromTo(".${id}-eb",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${du(0.22)},ease:"power3.out"},${at(0.08)});`,
      ...(head.lines.length ? maskTweens(id, ctx, 0.18) : []),
      ...(key ? [`tl.to(".${id}-key",{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.56)});`, ...glowTweens(id, ctx, 0.6, "ha")] : []),
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.66)});` : "",
      chips.length ? `tl.fromTo("#${id} .mgc",{opacity:0,y:"${r(U(18))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"expo.out",stagger:${du(0.09)}},${at(0.8)});` : "",
      ...(shot ? paneTweens(`${id}-w`, ctx, 0.3, { from: "right" }) : []),
      ...ambient(ctx),
    ].filter(Boolean),
  };
}

// PANELS — the manifest's widest slot (1728x410, `objectFit: cover`). That is a STRIP, not a card:
// the capture spans the whole measure under the copy, in glass.
//
// THE BAND IS MEASURED OFF THE HEADLINE, NEVER GUESSED. A fixed top that suited one line runs the
// type straight over the first strip on two. The single-strip case takes the manifest's own 410/1728
// height exactly; the two-strip case divides what is left, which is wider than 4.2:1 — cover-crop
// absorbs it, and a strip that spans the column is the point of the slot.
function sPanels(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const S = ctx.S || STRINGS;
  const pics = (shots || []).filter((x) => x && x.path).slice(0, 2);
  if (!pics.length) return dress(K.statement(scene, ctx), ctx);
  const head = K.fitLines(String(scene.headline || scene.title || ""), U(1300) / K.camSafe(), U(72), 2, th.adv);
  const top = U(210), gap = U(26);
  const bandTop = top + U(46) + head.lines.length * head.size * 1.08 + U(46);
  const h = pics.length === 2
    ? (FOOT - bandTop - gap) / 2
    : Math.min(FOOT - bandTop, (COL * 410) / 1728);
  const bar = h >= U(300);
  return {
    ...ground(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(top)}cqw;width:${r(U(1300))}cqw;z-index:4;">
      <div class="${id}-eb" style="margin-bottom:${r(U(22))}cqw;opacity:0;">${label(th, String(scene.kicker || S.panels || STRINGS.panels).slice(0, 30), th.accent)}</div>
      ${head.lines.length ? mask(id, head.lines, display(th, head.size, 600)) : ""}
    </div>
    ${pics.map((p, i) => windowPane(`${id}-p${i}`, th, {
    x: M, y: bandTop + i * (h + gap), w: COL, h, shot: p, url: ctx.url, bar,
  })).join("")}`,
    s: [
      `tl.fromTo(".${id}-eb",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${du(0.2)},ease:"power3.out"},${at(0.06)});`,
      ...(head.lines.length ? maskTweens(id, ctx, 0.14) : []),
      ...pics.flatMap((_, i) => paneTweens(`${id}-p${i}`, ctx, 0.42 + i * 0.16)),
      ...ambient(ctx),
    ].filter(Boolean),
  };
}

// READOUT — THE ONLY BEAT THAT PRINTS FIGURES AS FIGURES (see SPEC.carry). An instrument cluster:
// one glass tile per figure, a mono channel index, the number counting up, a neon tick under it and
// the label the script itself supplied. Nothing here is invented — a proof card printing a number
// the script never claimed is the defect the agent audit closed.
function sReadout(scene, ctx) {
  const { id, th, at, du } = ctx;
  const S = ctx.S || STRINGS;
  const stats = K.numbersIn(scene, 4);
  if (stats.length < 2) return dress(K.statement(scene, ctx), ctx);
  const headText = String(scene.headline || scene.title || "").slice(0, 60);
  const hz = K.fitOne(headText, U(1300), U(72), th.adv);
  const gap = U(26), w = (COL - gap * (stats.length - 1)) / stats.length;
  const y = U(520), h = U(330);
  return {
    ...ground(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(220))}cqw;width:${r(U(1300))}cqw;z-index:4;">
      <div class="${id}-eb" style="margin-bottom:${r(U(22))}cqw;opacity:0;">${label(th, String(scene.kicker || S.readout || STRINGS.readout).slice(0, 30), th.accent)}</div>
      ${headText ? mask(id, [headText], display(th, hz, 600)) : ""}
    </div>
    ${stats.map((st, i) => pane(`${id}-t${i}`, th, {
    x: M + i * (w + gap), y, w, h, pad: U(34),
    inner: `<div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;">
        <div style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.24em;color:${th.accent};">CH ${K.pad2(i + 1)}</div>
        <div>
          <div style="${display(th, K.fitOne(`${st.v}${st.suffix}`, w - U(80), U(112), th.adv), 600, i === 0 ? th.accent : th.ink)}line-height:1;white-space:nowrap;${i === 0 ? `text-shadow:0 0 ${r(U(34))}cqw ${rgba(th.accent, 0.45)};` : ""}"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
          <div class="${id}-tk${i}" style="margin-top:${r(U(20))}cqw;width:${r(U(72))}cqw;height:${r(U(3))}cqw;background:${th.accent};box-shadow:0 0 ${r(U(12))}cqw ${rgba(th.accent, 0.6)};transform-origin:left center;"></div>
          <div style="margin-top:${r(U(20))}cqw;">${label(th, K.statLabel(scene, i), rgba(FROST, 0.72), U(17))}</div>
        </div>
      </div>`,
  })).join("")}`,
    s: [
      `tl.fromTo(".${id}-eb",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${du(0.2)},ease:"power3.out"},${at(0.06)});`,
      ...(headText ? maskTweens(id, ctx, 0.14) : []),
      ...stats.flatMap((st, i) => [
        ...paneTweens(`${id}-t${i}`, ctx, 0.34 + i * 0.12, { from: "up" }),
        `tl.fromTo(".${id}-tk${i}",{scaleX:0},{scaleX:1,duration:${du(0.3)},ease:"expo.out"},${at(0.5 + i * 0.12)});`,
        countTween(id, ctx, i, st, 0.46 + i * 0.12),
      ]),
      ...ambient(ctx),
    ].filter(Boolean),
  };
}

// STACK — the sequence. Steps ride their own glass rows on the left; the manifest's `how` slots
// (998x367, `objectFit: contain`) sit on glass shelves at the right, which is what `contain` means:
// a product image inside its frame rather than cropped to fill it.
//
// TWO LAYOUTS, ONE ROLE. With no picture the steps take the whole measure as cards — the alternative
// is a right-hand column of empty shelves, which is the container law.
function sStack(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const S = ctx.S || STRINGS;
  const steps = K.bullets(scene, 3);
  if (steps.length < 2) return dress(K.statement(scene, ctx), ctx);
  const pics = (shots || []).filter((x) => x && x.path).slice(0, 2);
  const headText = String(scene.headline || S.stack || STRINGS.stack).slice(0, 60);
  const hz = K.fitOne(headText, U(1300), U(72), th.adv);
  const gap = U(26);
  // With pictures: a 800-wide column of rows beside the shelves, each row's pitch DIVIDED out of the
  // room between its top and the foot, so two steps and three both land above the rail.
  const rowW = U(800), rowTop = U(370);
  const rowH = Math.min(U(180), (FOOT - rowTop) / Math.max(1, steps.length));
  // Without pictures: the same steps as cards across the whole measure.
  const cardW = (COL - gap * (steps.length - 1)) / steps.length;
  const shelfH = U(280), shelfW = U(760);
  const shelfY = pics.length === 2 ? [U(350), U(650)] : [U(430)];
  return {
    ...ground(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(210))}cqw;width:${r(U(1300))}cqw;z-index:4;">
      <div class="${id}-eb" style="margin-bottom:${r(U(22))}cqw;opacity:0;">${label(th, String(scene.kicker || S.stack || STRINGS.stack).slice(0, 30), th.accent)}</div>
      ${mask(id, [headText], display(th, hz, 600))}
    </div>
    ${pics.length
    ? steps.map((st, i) => pane(`${id}-s${i}`, th, {
      x: M, y: rowTop + i * rowH, w: rowW, h: rowH - U(18), pad: U(26),
      inner: `<div style="position:relative;height:100%;display:flex;align-items:center;gap:${r(U(22))}cqw;">
          <span style="display:inline-grid;place-items:center;width:${r(U(52))}cqw;height:${r(U(52))}cqw;border-radius:${r(U(14))}cqw;background:${rgba(th.accent, 0.14)};border:1px solid ${rgba(th.accent, 0.45)};font-family:${th.monoStack};font-size:${r(U(20))}cqw;color:${th.accent};flex:0 0 auto;">${K.pad2(i + 1)}</span>
          <span style="${display(th, U(30), 500)}line-height:1.24;">${esc(String(st).slice(0, 72))}</span>
        </div>`,
    })).join("")
    : steps.map((st, i) => pane(`${id}-s${i}`, th, {
      x: M + i * (cardW + gap), y: U(470), w: cardW, h: U(320), pad: U(36),
      inner: `<div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;">
          <span style="font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.24em;color:${th.accent};">${K.pad2(i + 1)}</span>
          <span style="${display(th, U(32), 500)}line-height:1.26;">${esc(String(st).slice(0, 80))}</span>
        </div>`,
    })).join("")}
    ${pics.map((p, i) => windowPane(`${id}-w${i}`, th, {
    x: U(1040), y: shelfY[i] || shelfY[0], w: shelfW, h: shelfH, shot: p, bar: false, contain: true, pad: U(24),
  })).join("")}`,
    s: [
      `tl.fromTo(".${id}-eb",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${du(0.2)},ease:"power3.out"},${at(0.06)});`,
      ...maskTweens(id, ctx, 0.14),
      ...steps.flatMap((_, i) => paneTweens(`${id}-s${i}`, ctx, 0.32 + i * 0.12)),
      ...pics.flatMap((_, i) => paneTweens(`${id}-w${i}`, ctx, 0.5 + i * 0.16, { from: "right" })),
      ...ambient(ctx),
    ].filter(Boolean),
  };
}

// RIBBON — the manifest's `context` slot is 826x162, and TWO of them. 826 + 28 + 826 = 1680, which is
// this pack's column exactly: the two extreme letterboxes lie side by side along the foot of the
// frame like a strip of film under the line they illustrate. That geometry came out of the brief; it
// is the reason the measure is 1680 in the first place.
function sRibbon(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const S = ctx.S || STRINGS;
  const pics = (shots || []).filter((x) => x && x.path).slice(0, 2);
  const q = String(scene.quote || scene.subtext || scene.headline || "").trim().slice(0, 200);
  if (!pics.length || !q) return dress(K.statement(scene, ctx), ctx);
  const by = String(scene.attribution || scene.emphasis || "").trim().slice(0, 60);
  const pad = U(50);
  // A MEASURE, not the pane's full width. fitLines takes the fewest lines it can, so a quote given
  // the whole 1580 column sets as one 36px line across the frame — technically fitted and visually
  // limp. Holding the measure at 1150 makes the same words wrap to two lines at ~47px, which is a
  // pull quote. The pane stays full width; the copy inside it does not.
  const qw = Math.min(COL - pad * 2, U(1150));
  // The pane is sized to its OWN copy. It has overflow:hidden, so a fixed height would clip the
  // fourth line of a long quote — the ceiling belongs on the type, not on the box. 1.36 is the
  // budget per line and the quote is set at 1.32, so the measurement is always the generous side of
  // what renders. A quote is the one place this pack loosens its leading.
  const fit = K.fitLines(q, qw / K.camSafe(), U(48), 4, th.adv);
  const paneY = U(240);
  const paneH = pad * 2 + U(46) + fit.lines.length * fit.size * 1.36 + (by ? U(52) : 0);
  const ribY = U(750), ribW = U(826), ribH = U(162), gap = U(28);
  return {
    ...ground(ctx),
    html: `
    ${pane(`${id}-q`, th, {
    x: M, y: paneY, w: COL, h: paneH, pad,
    inner: `<div class="${id}-eb" style="opacity:0;">${label(th, String(scene.kicker || S.ribbon || STRINGS.ribbon).slice(0, 30), th.accent)}</div>
      <div style="margin-top:${r(U(24))}cqw;width:${r(qw)}cqw;">${mask(id, fit.lines, `${display(th, fit.size, 500)}line-height:1.32;`)}</div>
      ${by ? `<div class="${id}-by" style="margin-top:${r(U(26))}cqw;opacity:0;">${label(th, by, rgba(FROST, 0.72), U(17))}</div>` : ""}`,
  })}
    ${pics.map((p, i) => windowPane(`${id}-r${i}`, th, {
    x: M + i * (ribW + gap), y: ribY, w: ribW, h: ribH, shot: p, bar: false, radius: U(14),
  })).join("")}
    ${pics.length === 1 ? `<div class="${id}-cap" style="position:absolute;left:${r(M + ribW + gap)}cqw;top:${r(ribY)}cqw;width:${r(ribW)}cqw;height:${r(ribH)}cqw;display:flex;flex-direction:column;justify-content:center;gap:${r(U(14))}cqw;z-index:4;opacity:0;">
      ${label(th, `${S.fig || STRINGS.fig} ${K.pad2(1)} ／ ${String(ctx.label || S.ribbon || STRINGS.ribbon).slice(0, 22)}`, th.accent, U(17))}
      ${label(th, ctx.url, rgba(FROST, 0.6), U(17))}
    </div>` : ""}`,
    s: [
      ...paneTweens(`${id}-q`, ctx, 0.05),
      `tl.to(".${id}-eb",{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.2)});`,
      ...maskTweens(id, ctx, 0.26),
      by ? `tl.to(".${id}-by",{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.66)});` : "",
      ...pics.flatMap((_, i) => paneTweens(`${id}-r${i}`, ctx, 0.5 + i * 0.14)),
      pics.length === 1 ? `tl.fromTo(".${id}-cap",{opacity:0,x:"${r(U(20))}cqw"},{opacity:1,x:0,duration:${du(0.26)},ease:"power3.out"},${at(0.68)});` : "",
      ...ambient(ctx),
    ].filter(Boolean),
  };
}

// SIGNOFF — the close. The whole lockup sits on ONE wide glass plinth, still left-aligned, and the
// ground gains a rising bloom from below: the nocturne brightening rather than ending. The neon pill
// is the only FILLED accent shape in the film, which is what makes it read as the call.
function sSignoff(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const S = ctx.S || STRINGS;
  const pad = U(64);
  const head = K.fitLines(String(scene.headline || scene.emphasis || ctx.title || ""), (COL - pad * 2) / K.camSafe(), U(92), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 24) || S.go || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  // Measured, then centred: a one-line close and a two-line close both sit balanced in the frame
  // instead of one of them clipping and the other floating.
  const partsH = U(72) + U(28) + head.lines.length * head.size * 1.06 + U(42) + U(74) + U(28) + U(32);
  const paneH = pad * 2 + partsH;
  const paneY = Math.max(U(230), (VH - paneH) / 2 + U(20));
  return {
    ...ground(ctx, `<div style="position:absolute;inset:0;background:${bloom(th.accent, 1500, 900, 34, 116, 0.22)};"></div>`),
    html: `
    ${pane(`${id}-c`, th, {
    x: M, y: paneY, w: COL, h: paneH, pad, radius: U(26),
    inner: `<div style="position:relative;height:100%;">
      <div style="height:${r(U(72))}cqw;display:flex;align-items:center;justify-content:space-between;">
        <div class="${id}-eb" style="opacity:0;">${label(th, String(scene.kicker || S.signoff || STRINGS.signoff).slice(0, 30), th.accent)}</div>
        ${hasMark ? `<div class="${id}-lg" style="width:${r(U(72))}cqw;height:${r(U(72))}cqw;border-radius:${r(U(18))}cqw;background:${rgba(GLASS, 0.07)};border:1px solid ${rgba(FROST, 0.2)};display:flex;align-items:center;justify-content:center;padding:${r(U(12))}cqw;box-sizing:border-box;flex:0 0 auto;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      </div>
      <div style="margin-top:${r(U(28))}cqw;">${head.lines.length ? mask(id, head.lines, display(th, head.size, 600)) : ""}</div>
      <div class="${id}-btn" style="margin-top:${r(U(42))}cqw;display:inline-block;background:${th.accent};color:${K.inkOn(th.accent, "#04060F")};font-family:${th.displayStack};font-weight:600;font-size:${r(K.fitOne(action, U(620), U(32), th.adv))}cqw;padding:${r(U(20))}cqw ${r(U(44))}cqw;border-radius:${r(U(100))}cqw;box-shadow:0 0 ${r(U(44))}cqw ${rgba(th.accent, 0.5)};opacity:0;">${esc(action)}</div>
      <div class="${id}-url" style="margin-top:${r(U(28))}cqw;opacity:0;">${label(th, ctx.url, rgba(FROST, 0.66), U(19))}</div>
    </div>`,
  })}`,
    s: [
      ...paneTweens(`${id}-c`, ctx, 0.04, { from: "up" }),
      `tl.to(".${id}-eb",{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.2)});`,
      hasMark ? `tl.fromTo(".${id}-lg",{opacity:0,y:"${r(U(18))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"expo.out"},${at(0.26)});` : "",
      ...(head.lines.length ? maskTweens(id, ctx, 0.32) : []),
      `tl.fromTo(".${id}-btn",{opacity:0,y:"${r(U(18))}cqw"},{opacity:1,y:0,duration:${du(0.28)},ease:"expo.out"},${at(0.68)});`,
      `tl.to(".${id}-url",{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.84)});`,
      ...ambient(ctx),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "lockup", last: "signoff",
  middle: ["panels", "readout", "stack", "ribbon"],
  shapes: {
    // The manifest's own slot geometry, verbatim: feature/proof 1728x410, how 998x367,
    // context 826x162. The lockup window is 760x430, near 16:9, so a capture lands uncropped.
    lockup: [760 / 430],
    panels: [1728 / 410, 1728 / 410],
    stack: [998 / 367, 998 / 367],
    ribbon: [826 / 162, 826 / 162],
    readout: [], signoff: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => {
    const b = Math.max(0, budget);
    if (role === "panels" || role === "ribbon" || role === "stack") return Math.min(2, b);
    if (role === "lockup") return Math.min(1, b);
    return 0;
  },
  // The LAST GATE: a layout that ended up short draws hollow glass, so it degrades to `statement`.
  // `stack` needs none, because its no-picture branch is a real layout rather than a stripped one.
  needs: (role) => (role === "panels" || role === "ribbon" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "readout") return isStats;
    if (isStats) return false;                       // only `readout` prints figures as figures
    if (role === "panels") return budget >= 1;
    // NEITHER `ribbon` NOR `stack` TESTS THE BUDGET, and that is deliberate. Roles are dealt by a
    // ROTATING cursor: with four middles and only one of them budget-free, an eight-beat film spent
    // its budget by the fourth cut and then handed every remaining beat to the same layout — three
    // `stack`s, two of them adjacent, which reads as a stuck render. Letting these two decline only
    // on CONTENT keeps the rotation alternating; `needs` below is what still stops either of them
    // drawing glass around nothing when the pictures actually run out.
    if (role === "ribbon") return !!String(scene.quote || scene.subtext || scene.headline || "").trim();
    if (role === "stack") return K.bullets(scene, 3).length >= 2;
    return true;
  },
};

const BUILDERS = {
  lockup: sLockup, panels: sPanels, readout: sReadout, stack: sStack, ribbon: sRibbon, signoff: sSignoff,
  // The statement layouts wear the same ground, the same bezel and the same rail as every other
  // beat — including the ambient tweens, without which the nocturne's own furniture would be
  // rendered and then never move (a ghost, indistinguishable from furniture that failed to appear).
  statement: (sc, ctx) => dress(K.statement(sc, ctx), ctx),
  "statement-c": (sc, ctx) => dress(K.statement(sc, ctx, { centred: true }), ctx),
};

const LABELS = {
  lockup: STRINGS.open, panels: STRINGS.panels, readout: STRINGS.readout,
  stack: STRINGS.stack, ribbon: STRINGS.ribbon, signoff: STRINGS.signoff,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:1px solid ${rgba(FROST, 0.18)}; border-radius:${r(U(14))}cqw; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4,
    // `motion.drift: 1.05` from the manifest, and a measured push: a premium film glides in, it
    // does not lunge.
    camera: { push: 130, scale: 1.05 },
    signature: "editorial", fallbackBrand: "MIDNIGHT",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
