// TEAMPULSE — a stomp-typography office advertisement. Native GSAP + DOM, on om_port_kit.
//
// PROVENANCE. REBUILT 4 Aug 2026 against the readable reference source at
// templete-design/all-template-handoffs/Stomp/src/stomp-film.jsx (1080x1920, 14 scenes,
// ~35.8s, MAP = Hook/TypeWall/Problem/Outline/Reveal/Typewriter/Showcase/Highlight/Features/
// FlipWords/Team/BigQuote/Numbers/CTA).
//
// WHY A REBUILD. The first port was derived from the gzip+base64 bundle and got three big
// things wrong:
//   1. THE PALETTE WAS INVERTED. The reference ground is CREAM (#f5ead8) with near-black ink —
//      the Organic design-system tokens. The port shipped a dark umber ground.
//   2. THE OFFICE WAS MISSING ENTIRELY. The reference's own one-line description is "animated
//      office people (typing, walking, calling, waving, presenting)" and it ships twelve SVG
//      primitives for them — Worker, Desk, Chair, Plant, Coffee, OfficeBand, plus Ticker,
//      Cascade, StompWords, Portrait, DeskCard, Pill. The port had none of the twelve.
//   3. SIX SCENES WERE CONSOLIDATED AWAY on a wrong reading. "Problem/Outline/BigQuote are one
//      statement, framed" is false: Problem is INVERTED (dark ground, accent band, x-bulleted
//      pain list, office photo, rotated ticker), Outline is stroke-type filling from the left,
//      and BigQuote floods the ground with sage. All fourteen are distinct compositions.
//
// WHAT IS DELIBERATELY NOT COPIED. The reference is React over its own timeline engine, driven
// by a per-frame clock; this renders through the HyperFrames contract (ONE paused GSAP timeline
// the renderer SEEKS). Its trigonometric per-frame limb maths becomes repeating yoyo tweens on
// grouped parts — the office still types, walks, waves and calls, but in a handful of tweens
// rather than a per-frame recompute. Its demo copy is replaced by the storyboard's own words.
//
// SVG COORDINATES ARE RAW REFERENCE PIXELS. Every figure lives inside one 0 0 1080 1920
// viewBox, so the reference's own x/y numbers transcribe directly with no conversion. HTML
// geometry still converts with U(px) = px/1080*100.
//
// FONT SUBSTITUTION: none — the reference's own Caprasimo + Figtree are bundled.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1080, 1920);
const { U } = STAGE;

// Organic design-system tokens — hex mirrors of the reference's styles.css :root.
const T = {
  bg: "#f5ead8", surface: "#ebddc5", text: "#201e1d",
  accent: "#c67139", accent2: "#7a8a5e",
  n100: "#f9f4ed", n300: "#dcd3c4", n400: "#c0b6a5", n700: "#645c50", n900: "#2e2b25",
  a200: "#ffe1d0", a300: "#ffc6a5", a400: "#f6a06b", a600: "#b2622d", a700: "#8c491a",
  s200: "#e1eecc", s300: "#ccdbb2", s600: "#728157", s700: "#56633f",
};
const DISPLAY = "Caprasimo", BODY = "Figtree";

const STRINGS = {
  hook: "TEAMPULSE", wall: "THE PITCH", problem: "THE PROBLEM", outline: "NO NOISE",
  reveal: "MEET", typewriter: "THE CHANGE", showcase: "EVERY SCREEN", highlight: "THE TRADE",
  features: "WHAT YOU GET", flip: "IN SHORT", team: "REAL TEAMS", quote: "THE VERDICT",
  numbers: "THE NUMBERS", cta: "START TODAY",
  scene: "BEAT", of: "OF", go: "GET STARTED", andthat: "— AND THAT IS IT.",
};

function theme(brandSkin) {
  // Light ground, so the brand accent is DARKENED to stay readable on cream.
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: T.bg, isDark: false, packAccent: T.accent });
  return {
    ...T,
    accent,
    // The sage counter-tone is derived from the accent so a rebranded film repaints whole.
    accent2: K.spin(accent, 78, -0.04, 0.3),
    bg: T.bg, ink: T.text, panel: T.n100, sub: rgba(T.text, 0.66), line: rgba(T.text, 0.16),
    adv: K.ADVANCE.mixed,
    capBg: T.text, capInk: T.n100,
    ...K.fontStacks(DISPLAY, BODY, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- furniture ---------------------------------------------------------------
const M = U(56);                       // the reference's page margin
const COL = U(1080) - M * 2;

const svg = (inner, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 1080 1920" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;">${inner}</svg>`;

// ONE OFFICE WORKER, in raw reference coordinates. variant: type | walk | call | wave | present.
// The static placement rides the OUTER <g transform>; every animated part is an inner group with
// NO transform attribute, so GSAP owns its transform outright and cannot fight a CSS one.
function worker(id, { x, y, s = 1, variant = "type", shirt, hair, skin = "#e8b98e", flip = false, ink = "#2e2b25" }) {
  const arm = (x1, y1, x2, y2, cls = "") =>
    `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${shirt}" stroke-width="13" stroke-linecap="round" />`;
  const legs = variant === "walk"
    ? `<g class="${id}-step" stroke="${ink}" stroke-width="14" stroke-linecap="round"><line x1="-4" y1="-2" x2="8" y2="38" /><line x1="6" y1="-2" x2="-6" y2="38" /></g>`
    : variant === "type"
      ? `<g stroke="${ink}" stroke-width="14" stroke-linecap="round"><line x1="-6" y1="-4" x2="26" y2="4" /><line x1="26" y1="4" x2="26" y2="40" /><line x1="6" y1="-4" x2="36" y2="6" /><line x1="36" y1="6" x2="36" y2="40" /></g>`
      : `<g stroke="${ink}" stroke-width="14" stroke-linecap="round"><line x1="-6" y1="-2" x2="-8" y2="40" /><line x1="8" y1="-2" x2="10" y2="40" /></g>`;
  const arms = {
    type: `<g class="${id}-tap">${arm(-20, -50, -34, -14)}${arm(20, -50, 36, -14)}</g>`,
    walk: `<g class="${id}-swing">${arm(-20, -52, -30, -12)}${arm(20, -52, 30, -12)}</g>`,
    call: `<g>${arm(20, -52, 16, -92)}${arm(-20, -50, -30, -16)}<rect x="8" y="-104" width="16" height="26" rx="6" fill="${ink}" /></g>`,
    wave: `<g>${arm(-20, -50, -30, -14)}<g class="${id}-wave" style="transform-box:fill-box;transform-origin:0% 50%;"><g transform="translate(20 -52)">${arm(0, 0, 34, -6)}<circle cx="38" cy="-6" r="9" fill="${skin}" /></g></g></g>`,
    present: `<g>${arm(20, -50, 52, -62)}<circle cx="56" cy="-64" r="9" fill="${skin}" />${arm(-20, -50, -28, -16)}</g>`,
  }[variant] || "";
  return `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">
    ${legs}
    <g class="${id}-bob">
      <rect x="-26" y="-74" width="52" height="78" rx="24" fill="${shirt}" />
      ${arms}
      <circle cx="0" cy="-96" r="25" fill="${skin}" />
      <path d="M-25 -104 q 6 -26 25 -26 q 20 0 25 26 q -12 -12 -25 -12 q -14 0 -25 12 z" fill="${hair}" />
      <circle cx="-8" cy="-94" r="3.2" fill="${ink}" /><circle cx="8" cy="-94" r="3.2" fill="${ink}" />
      <path d="M-7 -84 q 7 6 14 0" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round" />
    </g>
  </g>`;
}
const desk = (id, th, { x, y, w = 250 }) => `<g transform="translate(${x} ${y})">
  <rect x="${-w / 2}" y="0" width="${w}" height="14" rx="7" fill="${th.n700}" />
  <rect x="${-w / 2 + 14}" y="14" width="12" height="56" rx="6" fill="${th.n700}" />
  <rect x="${w / 2 - 26}" y="14" width="12" height="56" rx="6" fill="${th.n700}" />
  <g transform="translate(0 -46)"><rect x="-38" y="-2" width="76" height="48" rx="6" fill="${th.n900}" /><rect class="${id}-screen" x="-32" y="4" width="64" height="34" rx="3" fill="${th.a300}" /><rect x="-46" y="44" width="92" height="9" rx="4.5" fill="${th.n400}" /></g>
</g>`;
const chair = (id, th, { x, y }) => `<g class="${id}-chair" transform="translate(${x} ${y})" style="transform-box:fill-box;transform-origin:50% 100%;">
  <rect x="-26" y="-56" width="52" height="46" rx="14" fill="${th.s600}" />
  <rect x="-30" y="-10" width="60" height="14" rx="7" fill="${th.s700}" />
  <rect x="-4" y="4" width="8" height="26" rx="4" fill="${th.n700}" />
  <path d="M-26 34 h52" stroke="${th.n700}" stroke-width="8" stroke-linecap="round" />
  <circle cx="-24" cy="38" r="5" fill="${th.n900}" /><circle cx="24" cy="38" r="5" fill="${th.n900}" />
</g>`;
const plant = (id, th, { x, y, s = 1 }) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-22 0 h44 l-6 40 h-32 z" fill="${th.a600}" />
  <g class="${id}-leaf" style="transform-box:fill-box;transform-origin:50% 100%;">
    <g stroke="${th.accent2}" stroke-width="7" fill="none" stroke-linecap="round">
      <path d="M0 0 q -6 -34 -24 -46" /><path d="M0 0 q 6 -38 26 -50" /><path d="M0 0 q 2 -44 2 -60" />
    </g>
    <ellipse cx="-24" cy="-48" rx="14" ry="9" fill="${th.s600}" />
    <ellipse cx="26" cy="-52" rx="15" ry="9" fill="${th.accent2}" />
    <ellipse cx="2" cy="-62" rx="13" ry="9" fill="${th.s600}" />
  </g>
</g>`;
const coffee = (id, th, { x, y, s = 1 }) => `<g transform="translate(${x} ${y}) scale(${s})">
  ${[0, 1, 2].map((i) => `<path class="${id}-steam" d="M${-8 + i * 8} -14 q 7 -10 0 -20" stroke="${rgba(th.n700, 0.5)}" stroke-width="4" fill="none" stroke-linecap="round" />`).join("")}
  <path d="M-14 -12 h28 l-4 28 h-20 z" fill="${th.n100}" stroke="${th.text}" stroke-width="3" />
  <path d="M14 -6 q 12 4 0 14" stroke="${th.text}" stroke-width="3" fill="none" />
</g>`;

// A band of office life that scrolls sideways forever. Reference OfficeBand: six-strong cast on
// a 300px span, desks and chairs for the typists.
const CAST = [
  { v: "type", desk: true }, { v: "walk", desk: false }, { v: "call", desk: false },
  { v: "type", desk: true }, { v: "wave", desk: false }, { v: "walk", desk: false },
];
function officeBand(id, th, { y, dark = false }) {
  const shirts = [th.accent, th.accent2, th.a600, th.s600];
  const hairs = ["#3b2a1d", "#6b4a2c", "#20201e", "#4a3427"];
  const ink = dark ? th.n100 : th.n900;
  const span = 300;
  // Two cast lengths laid end to end so the scroll can wrap without a seam.
  const row = (o) => CAST.map((c, i) => {
    const x = o + i * span + 90;
    return `${c.desk ? desk(id, th, { x: x + 30, y: 0, w: 210 }) + chair(id, th, { x: x - 66, y: -4 }) : ""}
      ${worker(id, { x, y: c.desk ? -14 : 0, s: 0.94, variant: c.v, shirt: shirts[i % 4], hair: hairs[i % 4], flip: i % 3 === 2, ink })}`;
  }).join("");
  return `<g transform="translate(0 ${y})"><g class="${id}-band">${row(0)}${row(CAST.length * span)}</g></g>`;
}
// One set of repeating tweens drives the whole office — the reference recomputes trig per frame,
// which a seeked timeline cannot do.
const officeTweens = (id, ctx, { scroll = 46 } = {}) => {
  const span = CAST.length * 300, dur = span / scroll;
  return [
    `tl.to(".${id}-band",{x:${-span},duration:${r(dur)},ease:"none",repeat:${K.reps(ctx.L, dur)}},${r(ctx.T)});`,
    `tl.to(".${id}-bob",{y:3,duration:1.3,ease:"sine.inOut",repeat:${K.reps(ctx.L, 1.3)},yoyo:true,stagger:0.11},${r(ctx.T)});`,
    `tl.to(".${id}-tap",{y:4,duration:0.35,ease:"sine.inOut",repeat:${K.reps(ctx.L, 0.35)},yoyo:true,stagger:0.07},${r(ctx.T)});`,
    `tl.to(".${id}-step",{rotation:9,duration:0.62,ease:"sine.inOut",repeat:${K.reps(ctx.L, 0.62)},yoyo:true,transformOrigin:"50% 0%",stagger:0.09},${r(ctx.T)});`,
    `tl.to(".${id}-swing",{rotation:-8,duration:0.62,ease:"sine.inOut",repeat:${K.reps(ctx.L, 0.62)},yoyo:true,transformOrigin:"50% 0%",stagger:0.09},${r(ctx.T)});`,
    `tl.to(".${id}-wave",{rotation:-46,duration:0.62,ease:"sine.inOut",repeat:${K.reps(ctx.L, 0.62)},yoyo:true},${r(ctx.T)});`,
    `tl.to(".${id}-chair",{rotation:3,duration:3.5,ease:"sine.inOut",repeat:${K.reps(ctx.L, 3.5)},yoyo:true},${r(ctx.T)});`,
    `tl.to(".${id}-leaf",{rotation:4,duration:2.6,ease:"sine.inOut",repeat:${K.reps(ctx.L, 2.6)},yoyo:true},${r(ctx.T)});`,
    // The steam FADES OUT, so it needs its own hard kill at the clip boundary — killing the
    // scene root is not enough when a seek can land after the fade.
    `tl.fromTo(".${id}-steam",{opacity:0.5,y:0},{opacity:0,y:-42,duration:1.8,ease:"none",repeat:${K.reps(ctx.L, 1.8)},stagger:0.6},${r(ctx.T)});`,
    // Keyed to the BEAT (T+L), not to the clip. Since the cut system landed, a clip outlives
    // its own beat by the xfade so the outgoing scene is still there for the incoming one to
    // transition against — so a kill at T+clipDur now falls AFTER the boundary the steam's
    // repeat window actually ends on, and a non-linear seek into the overlap could restore it.
    `tl.set(".${id}-steam",{opacity:0},${r(ctx.T + ctx.L)});`,
    `tl.to(".${id}-screen",{opacity:0.55,duration:0.63,ease:"sine.inOut",repeat:${K.reps(ctx.L, 0.63)},yoyo:true},${r(ctx.T)});`,
  ];
};

// The ground: hard colour blocks plus the two drifting Organic blobs.
function groundOf(id, th, blocks, bg) {
  return `<div style="position:absolute;inset:0;overflow:hidden;background:${bg || th.bg};">
    ${(blocks || []).map((b) => `<div style="position:absolute;left:0;right:0;top:${r(U(b.t))}cqw;height:${r(U(b.h))}cqw;background:${b.c};"></div>`).join("")}
    <div class="${id}-b1" style="position:absolute;width:${r(U(620))}cqw;height:${r(U(620))}cqw;border-radius:50%;right:${r(-U(220))}cqw;top:${r(U(300))}cqw;background:${rgba(th.accent2, 0.2)};"></div>
    <div class="${id}-b2" style="position:absolute;width:${r(U(470))}cqw;height:${r(U(470))}cqw;border-radius:50%;left:${r(-U(170))}cqw;bottom:${r(U(420))}cqw;background:${rgba(th.accent, 0.16)};"></div>
  </div>`;
}
const groundTweens = (id, ctx) => [
  `tl.to(".${id}-b1",{y:"${r(U(18))}cqw",duration:6.3,ease:"sine.inOut",repeat:${K.reps(ctx.L, 6.3)},yoyo:true},${r(ctx.T)});`,
  `tl.to(".${id}-b2",{y:"${r(-U(16))}cqw",duration:7.1,ease:"sine.inOut",repeat:${K.reps(ctx.L, 7.1)},yoyo:true},${r(ctx.T)});`,
];

// The locked chrome: a rotating brand token, the brand word, the url. Reference Chrome.
function chrome(ctx, ink) {
  const { th, id } = ctx;
  const c = ink || th.text;
  return `<div class="om-chrome">
    <div style="position:absolute;top:${r(U(46))}cqw;left:${r(U(46))}cqw;right:${r(U(46))}cqw;display:flex;align-items:center;gap:${r(U(14))}cqw;">
      <span class="${id}-tok" style="width:${r(U(62))}cqw;height:${r(U(62))}cqw;border-radius:50%;background:${th.accent};border:${r(U(4))}cqw solid ${c};display:grid;place-items:center;font-family:${th.displayStack};font-size:${r(U(32))}cqw;color:${K.inkOn(th.accent, T.text, T.n100)};flex:0 0 auto;">${esc((ctx.brand || "T").trim().charAt(0).toUpperCase())}</span>
      <span style="font-family:${th.displayStack};font-size:${r(U(42))}cqw;color:${c};white-space:nowrap;">${esc(ctx.brand)}</span>
      <span style="margin-left:auto;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(25))}cqw;color:${rgba(c, 0.72)};white-space:nowrap;">${esc(ctx.url)}</span>
    </div>
    <div style="position:absolute;left:${r(U(46))}cqw;right:${r(U(46))}cqw;bottom:${r(U(30))}cqw;height:${r(U(6))}cqw;background:${rgba(c, 0.16)};overflow:hidden;border-radius:${r(U(6))}cqw;">
      <div class="${id}-prog" style="width:100%;height:100%;background:${th.accent};transform:scaleX(0);transform-origin:left center;"></div>
    </div>
  </div>`;
}
const chromeSpin = (id, ctx) =>
  [`tl.to(".${id}-tok",{rotation:5,duration:3.9,ease:"sine.inOut",repeat:${K.reps(ctx.L, 3.9)},yoyo:true},${r(ctx.T)});`];

// A pill — the pack's hard-shadowed sticker. Reference Pill.
const pill = (th, t, bg, size = U(30)) =>
  `<span class="pill" style="display:inline-flex;align-items:center;gap:${r(U(10))}cqw;background:${bg};color:${K.inkOn(bg, T.text, T.n100)};border:${r(U(4))}cqw solid ${th.text};border-radius:${r(U(999))}cqw;padding:${r(U(12))}cqw ${r(U(28))}cqw;font-family:${th.displayStack};font-size:${r(size)}cqw;white-space:nowrap;box-shadow:0 ${r(U(8))}cqw 0 ${rgba(th.text, 0.9)};opacity:0;">${esc(t)}</span>`;

// A rotated scrolling type ticker. Reference Ticker.
function ticker(id, th, { text, bg, y, rot = -2, size = U(48) }) {
  const line = new Array(8).fill(text).join("   ★   ");
  return `<div style="position:absolute;left:${r(-U(70))}cqw;right:${r(-U(70))}cqw;top:${r(U(y))}cqw;height:${r(U(92))}cqw;background:${bg};border-top:${r(U(4))}cqw solid ${th.text};border-bottom:${r(U(4))}cqw solid ${th.text};overflow:hidden;display:flex;align-items:center;rotate:${rot}deg;">
    <div class="${id}-tk" style="white-space:nowrap;font-family:${th.displayStack};font-size:${r(size)}cqw;color:${K.inkOn(bg, T.text, T.n100)};letter-spacing:0.02em;">${esc(line)}   ${esc(line)}</div>
  </div>`;
}
const tickerTween = (id, ctx, speed = 150) =>
  [`tl.to(".${id}-tk",{x:"${r(-U(1500))}cqw",duration:${r(1500 / speed)},ease:"none",repeat:${K.reps(ctx.L, 1500 / speed)}},${r(ctx.T)});`];

// The FULL-WIDTH 16:9 desktop card — the pack's screenshot device. Reference DeskCard: 4px
// keyline, 16px hard shadow, a wipe reveal and a sheen sweep. Only ever drawn around a picture.
function deskCard(id, th, { cls, url, shot, tilt = 0 }) {
  return `<div class="${cls}" style="width:100%;height:100%;rotate:${tilt}deg;opacity:0;">
    <div style="width:100%;height:100%;border-radius:${r(U(16))}cqw;overflow:hidden;background:${th.n100};border:${r(U(4))}cqw solid ${th.text};box-shadow:0 ${r(U(16))}cqw 0 ${rgba(th.text, 0.9)};display:flex;flex-direction:column;position:relative;box-sizing:border-box;">
      <div style="height:${r(U(58))}cqw;flex:0 0 auto;background:${th.text};display:flex;align-items:center;gap:${r(U(10))}cqw;padding:0 ${r(U(22))}cqw;">
        ${[th.accent, th.a400, th.accent2].map((c) => `<span style="width:${r(U(16))}cqw;height:${r(U(16))}cqw;border-radius:50%;background:${c};flex:0 0 auto;"></span>`).join("")}
        <div style="margin-left:${r(U(14))}cqw;flex:1 1 auto;max-width:${r(U(460))}cqw;height:${r(U(30))}cqw;border-radius:${r(U(999))}cqw;background:${rgba(th.n100, 0.16)};display:flex;align-items:center;padding:0 ${r(U(18))}cqw;box-sizing:border-box;font-family:${th.bodyStack};font-weight:700;font-size:${r(U(17))}cqw;color:${rgba(th.n100, 0.88)};overflow:hidden;white-space:nowrap;">${esc(url)}</div>
      </div>
      <div style="flex:1 1 auto;min-height:0;position:relative;overflow:hidden;">
        <div class="${cls}-w" style="width:100%;height:100%;">${K.shotFill(shot, { bg: th.surface })}</div>
        <div class="${cls}-sh" style="position:absolute;top:0;bottom:0;left:-32%;width:24%;background:linear-gradient(100deg, transparent, ${rgba("#ffffff", 0.42)}, transparent);skew:-12deg;"></div>
      </div>
    </div>
  </div>`;
}
const deskCardTweens = (cls, ctx, at) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.1)},ease:"none"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}",{scale:0.94},{scale:1,duration:${ctx.du(0.34)},ease:"power2.inOut"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}-w",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:${ctx.du(0.34)},ease:"power2.inOut"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}-sh",{x:"0cqw"},{x:"${r(U(1400))}cqw",duration:2.6,ease:"none",repeat:${K.reps(Math.max(0, ctx.L - at * ctx.k), 2.6)}},${ctx.at(at + 0.36)});`,
];

// GIANT WORD SLAMS with alternating boxed fills. Reference StompWords.
function stompWords(id, th, words, size) {
  const palette = [th.text, th.accent, th.accent2];
  return `<div style="display:flex;flex-direction:column;gap:${r(U(8))}cqw;align-items:flex-start;">
    ${words.map((w, i) => {
    const boxed = i % 2 === 1, bg = palette[i % 3];
    return `<div class="${id}-sw" style="align-self:flex-start;opacity:0;transform-origin:left center;">
        <span style="display:inline-block;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:0.92;letter-spacing:-0.015em;color:${boxed ? K.inkOn(bg, T.text, T.n100) : bg};background:${boxed ? bg : "transparent"};border-radius:${boxed ? r(U(16)) + "cqw" : "0"};padding:${boxed ? `${r(U(2))}cqw ${r(U(26))}cqw ${r(U(12))}cqw` : `${r(U(2))}cqw 0 ${r(U(12))}cqw`};">${esc(w)}</span>
      </div>`;
  }).join("")}
  </div>`;
}

// ---- scenes ------------------------------------------------------------------
// HOOK — the opener: three giant word slams over an office band and a rotated ticker.
function sHook(scene, ctx) {
  const { id, th, at, du } = ctx;
  // Reference Hook stacks THREE word slams (s.words). The HEADLINE is the run that has
  // three words in it; the beat emphasis is usually one, which rendered as a lone word.
  const words = K.wordsOf(scene.headline || scene.emphasis || ctx.title).slice(0, 3).map((w) => w.toUpperCase());
  if (!words.length) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const longest = words.reduce((a, w) => Math.max(a, w.length), 1);
  const size = Math.min(U(216), ((COL / K.camSafe()) * 0.94) / (longest * K.ADVANCE.upper));
  const body = String(scene.subtext || "").trim().slice(0, 110);
  return {
    backdrop: groundOf(id, th, [{ t: 0, h: 300, c: th.accent }, { t: 1560, h: 360, c: th.s200 }]),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:${r(U(58))}cqw;right:${r(U(58))}cqw;top:${r(U(400))}cqw;">
      ${stompWords(id, th, words, size)}
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(32))}cqw;max-width:${r(U(860))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(36))}cqw;line-height:1.3;color:${rgba(th.text, 0.8)};opacity:0;">${esc(body)}</div>` : ""}
    </div>
    ${svg(officeBand(id, th, { y: 1610 }) + plant(id, th, { x: 70, y: 1608 }) + plant(id, th, { x: 1010, y: 1606, s: 0.9 }))}
    ${ticker(id, th, { text: String(scene.kicker || STRINGS.hook).toUpperCase(), bg: th.a200, y: 1440, rot: -2.5 })}`,
    s: [
      `tl.fromTo(".${id}-sw",{opacity:0,scale:2.35},{opacity:1,scale:1,duration:${du(0.18)},ease:"expo.out",stagger:${du(0.1)}},${at(0.05)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.48)});` : "",
      ...tickerTween(id, ctx, 175), ...officeTweens(id, ctx, { scroll: 40 }),
      ...groundTweens(id, ctx), ...chromeSpin(id, ctx),
    ].filter(Boolean),
  };
}

// TYPEWALL — rows of giant type scrolling in opposite directions. Reference TypeWall.
function sTypeWall(scene, ctx) {
  const { id, th, at, du } = ctx;
  const src = K.bullets(scene, 4).length >= 2 ? K.bullets(scene, 4) : K.wordsOf(scene.emphasis || scene.headline || "");
  const rows = src.slice(0, 4).map((w) => String(w).toUpperCase().slice(0, 14));
  if (rows.length < 2) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const cols = [th.text, th.accent, th.accent2, th.text];
  return {
    backdrop: groundOf(id, th, [{ t: 0, h: 240, c: th.accent }, { t: 1680, h: 240, c: th.accent2 }]),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:0;right:0;top:${r(U(330))}cqw;display:flex;flex-direction:column;gap:${r(U(6))}cqw;">
      ${rows.map((w, i) => `<div class="${id}-row" style="overflow:hidden;height:${r(U(210))}cqw;display:flex;align-items:center;opacity:0;">
        <div class="${id}-rw${i}" style="white-space:nowrap;font-family:${th.displayStack};font-size:${r(U(176))}cqw;line-height:1;color:${cols[i % 4]};letter-spacing:-0.01em;">${esc(new Array(6).fill(w).join(" • "))}   ${esc(new Array(6).fill(w).join(" • "))}</div>
      </div>`).join("")}
    </div>
    <div style="position:absolute;left:0;right:0;top:${r(U(1300))}cqw;text-align:center;">${pill(th, String(scene.kicker || STRINGS.wall).toUpperCase().slice(0, 30), th.n100, U(34))}</div>
    ${svg(officeBand(id, th, { y: 1720 }))}`,
    s: [
      `tl.to(".${id}-row",{opacity:1,duration:${du(0.1)},ease:"none",stagger:${du(0.07)}},${at(0.04)});`,
      ...rows.map((_w, i) => `tl.to(".${id}-rw${i}",{x:"${r((i % 2 ? 1 : -1) * U(1600))}cqw",duration:${r(1600 / (78 + i * 8))},ease:"none",repeat:${K.reps(ctx.L, 1600 / (78 + i * 8))}},${r(ctx.T)});`),
      `tl.fromTo("#${id} .pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.24)},ease:"back.out(1.8)"},${at(0.4)});`,
      ...officeTweens(id, ctx, { scroll: 64 }), ...groundTweens(id, ctx), ...chromeSpin(id, ctx),
    ],
  };
}

// PROBLEM — INVERTED: dark ground, an accent band, a x-bulleted pain list, an office photo and a
// rotated ticker. The first port had no equivalent of this beat at all.
function sProblem(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const pains = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 22));
  if (pains.length < 2) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const shot = shots[0] || null;
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(132), 2, K.ADVANCE.upper);
  return {
    backdrop: groundOf(id, th, [{ t: 250, h: 210, c: th.accent }], th.text),
    chrome: chrome(ctx, th.n100),
    capTint: th.n100,
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(250))}cqw;">
      <div class="${id}-head" style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.9;color:${th.n100};padding:0 ${r(U(22))}cqw;opacity:0;transform-origin:left center;text-transform:uppercase;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div style="margin-top:${r(U(50))}cqw;display:flex;flex-direction:column;gap:${r(U(24))}cqw;">
        ${pains.map((p) => `<div class="${id}-pain" style="display:flex;align-items:center;gap:${r(U(22))}cqw;opacity:0;transform-origin:left center;">
          <span style="width:${r(U(66))}cqw;height:${r(U(66))}cqw;border-radius:50%;background:${th.accent};color:${th.n100};display:grid;place-items:center;font-family:${th.displayStack};font-size:${r(U(34))}cqw;flex:0 0 auto;">✕</span>
          <span style="font-family:${th.displayStack};font-size:${r(U(74))}cqw;color:${th.n100};">${esc(p)}</span>
        </div>`).join("")}
      </div>
    </div>
    ${svg(officeBand(id, th, { y: 1250, dark: true }) + coffee(id, th, { x: 905, y: 1246, s: 1.5 }))}
    ${shot ? `<div class="${id}-photo" style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(1340))}cqw;height:${r(U(300))}cqw;border-radius:${r(U(16))}cqw;overflow:hidden;border:${r(U(5))}cqw solid ${th.n100};box-sizing:border-box;opacity:0;">${K.shotFill(shot, { bg: th.n900 })}</div>` : ""}
    ${ticker(id, th, { text: String(scene.kicker || STRINGS.problem).toUpperCase(), bg: th.accent, y: 1700, rot: 2 })}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,scale:1.9},{opacity:1,scale:1,duration:${du(0.18)},ease:"expo.out"},${at(0.04)});`,
      `tl.fromTo(".${id}-pain",{opacity:0,scale:1.8},{opacity:1,scale:1,duration:${du(0.16)},ease:"expo.out",stagger:${du(0.1)}},${at(0.24)});`,
      shot ? `tl.fromTo(".${id}-photo",{opacity:0,scale:0.62},{opacity:1,scale:1,duration:${du(0.24)},ease:"back.out(1.8)"},${at(0.56)});` : "",
      ...tickerTween(id, ctx, 205), ...officeTweens(id, ctx, { scroll: 26 }), ...chromeSpin(id, ctx),
    ].filter(Boolean),
  };
}

// OUTLINE — stroke type that fills in from the left, then tags and a ghosted footer.
function sOutline(scene, ctx) {
  const { id, th, at, du } = ctx;
  const words = K.wordsOf(scene.emphasis || scene.headline || "").slice(0, 2).map((w) => w.toUpperCase());
  if (!words.length) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const longest = words.reduce((a, w) => Math.max(a, w.length), 1);
  const size = Math.min(U(200), ((COL / K.camSafe()) * 0.94) / (longest * K.ADVANCE.upper));
  const body = String(scene.subtext || "").trim().slice(0, 110);
  const tags = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 18));
  return {
    backdrop: groundOf(id, th, [{ t: 1560, h: 360, c: th.accent }], th.surface),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(400))}cqw;">
      ${words.map((w, i) => `<div class="${id}-ow" style="position:relative;height:${r(size * 1.05)}cqw;opacity:0;">
        <div style="position:absolute;inset:0;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1.02;color:transparent;-webkit-text-stroke:${r(U(4))}cqw ${rgba(th.text, 0.55)};">${esc(w)}</div>
        <div class="${id}-of${i}" style="position:absolute;inset:0;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1.02;color:${i % 2 ? th.accent2 : th.accent};clip-path:inset(0 100% 0 0);">${esc(w)}</div>
      </div>`).join("")}
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(26))}cqw;max-width:${r(U(860))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(34))}cqw;line-height:1.28;color:${rgba(th.text, 0.8)};opacity:0;">${esc(body)}</div>` : ""}
      ${tags.length ? `<div style="margin-top:${r(U(40))}cqw;display:flex;gap:${r(U(14))}cqw;flex-wrap:wrap;">${tags.map((t, i) => pill(th, t, [th.accent, th.n100, th.accent2][i % 3], U(27))).join("")}</div>` : ""}
      <div class="${id}-foot" style="margin-top:${r(U(44))}cqw;font-family:${th.displayStack};font-size:${r(U(74))}cqw;line-height:1;color:${rgba(th.text, 0.28)};opacity:0;">${esc(ctx.S.andthat)}</div>
    </div>
    ${svg(worker(id, { x: 200, y: 1700, s: 1.2, variant: "walk", shirt: th.n100, hair: "#3b2a1d", ink: th.n900 })
      + worker(id, { x: 860, y: 1700, s: 1.15, variant: "call", shirt: th.s200, hair: "#4a3427", flip: true, ink: th.n900 }))}`,
    s: [
      `tl.fromTo(".${id}-ow",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.14)},ease:"power3.out",stagger:${du(0.16)}},${at(0.02)});`,
      ...words.map((_w, i) => `tl.fromTo(".${id}-of${i}",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:${du(0.34)},ease:"power2.inOut"},${at(0.06 + i * 0.16)});`),
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.18)},ease:"power3.out"},${at(0.5)});` : "",
      tags.length ? `tl.fromTo("#${id} .pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.24)},ease:"back.out(1.8)",stagger:${du(0.08)}},${at(0.6)});` : "",
      `tl.fromTo(".${id}-foot",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.18)},ease:"power3.out"},${at(0.78)});`,
      ...officeTweens(id, ctx), ...groundTweens(id, ctx), ...chromeSpin(id, ctx),
    ].filter(Boolean),
  };
}

// REVEAL — the product lands: a centred brand lockup over a full-width 16:9 desk card, with
// presenting and waving workers and a row of tag pills. A PICTURE beat, missing from the port.
function sReveal(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const word = String(scene.emphasis || ctx.brand || "").trim().slice(0, 18);
  const size = K.fitOne(word, COL / K.camSafe(), U(136), K.ADVANCE.upper);
  const body = String(scene.subtext || "").trim().slice(0, 110);
  const tags = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 16));
  return {
    backdrop: groundOf(id, th, [{ t: 0, h: 640, c: th.accent }, { t: 1560, h: 360, c: th.s200 }]),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(230))}cqw;text-align:center;">
      <div style="display:inline-block;">${pill(th, String(scene.kicker || STRINGS.reveal).toUpperCase().slice(0, 20), th.n100)}</div>
      <div class="${id}-brand" style="margin-top:${r(U(20))}cqw;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:0.92;letter-spacing:-0.02em;color:${th.n100};white-space:nowrap;opacity:0;transform-origin:center center;text-transform:uppercase;">${esc(word)}</div>
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(12))}cqw;margin-left:auto;margin-right:auto;max-width:${r(U(850))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(34))}cqw;line-height:1.28;color:${th.a900 || rgba(th.text, 0.9)};opacity:0;">${esc(body)}</div>` : ""}
    </div>
    <div style="position:absolute;left:${r(U(52))}cqw;right:${r(U(52))}cqw;top:${r(U(740))}cqw;height:${r(U(606))}cqw;">
      ${deskCard(id, th, { cls: `${id}-dk`, url: ctx.url, shot })}
    </div>
    ${svg(worker(id, { x: 190, y: 1700, s: 1.15, variant: "present", shirt: th.accent2, hair: "#3b2a1d", ink: th.n900 })
      + worker(id, { x: 880, y: 1700, s: 1.1, variant: "wave", shirt: th.accent, hair: "#6b4a2c", flip: true, ink: th.n900 })
      + plant(id, th, { x: 1010, y: 1696, s: 0.85 }))}
    ${tags.length ? `<div style="position:absolute;left:${r(U(40))}cqw;right:${r(U(40))}cqw;top:${r(U(1420))}cqw;display:flex;gap:${r(U(12))}cqw;flex-wrap:wrap;justify-content:center;">${tags.map((t, i) => pill(th, t, [th.accent2, th.n100, th.a400][i % 3], U(25))).join("")}</div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-brand",{opacity:0,scale:2.4},{opacity:1,scale:1,duration:${du(0.2)},ease:"expo.out"},${at(0.1)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.28)});` : "",
      `tl.fromTo("#${id} .pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.24)},ease:"back.out(1.8)",stagger:${du(0.07)}},${at(0.03)});`,
      ...deskCardTweens(`${id}-dk`, ctx, 0.3),
      ...officeTweens(id, ctx), ...groundTweens(id, ctx), ...chromeSpin(id, ctx),
    ].filter(Boolean),
  };
}

// TYPEWRITER — a dark beat: one line typed out under a blinking caret, then tag pills.
function sTypewriter(scene, ctx) {
  const { id, th, at, du } = ctx;
  const full = String(scene.emphasis || scene.headline || "").trim().slice(0, 42);
  if (!full) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const size = Math.min(U(138), ((COL / K.camSafe()) * 0.92 * 2) / Math.max(1, full.length * K.ADVANCE.mixed));
  const tags = K.bullets(scene, 2).map((b) => String(b).toUpperCase().slice(0, 20));
  const chars = full.split("");
  return {
    backdrop: groundOf(id, th, [{ t: 240, h: 8, c: th.accent }], th.text),
    chrome: chrome(ctx, th.n100),
    capTint: th.n100,
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(400))}cqw;">
      <div class="${id}-brow" style="font-family:${th.bodyStack};font-weight:800;font-size:${r(U(30))}cqw;letter-spacing:0.22em;text-transform:uppercase;color:${th.a400};margin-bottom:${r(U(26))}cqw;opacity:0;">${esc(String(scene.kicker || STRINGS.typewriter).slice(0, 30))}</div>
      <div style="font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1;color:${th.n100};">
        ${chars.map((c) => `<span class="${id}-ch" style="opacity:0;white-space:pre;">${esc(c)}</span>`).join("")}<span class="${id}-caret" style="display:inline-block;width:0.5em;height:0.86em;vertical-align:-0.08em;background:${th.accent};margin-left:${r(U(6))}cqw;"></span>
      </div>
      ${tags.length ? `<div style="margin-top:${r(U(34))}cqw;display:flex;gap:${r(U(14))}cqw;flex-wrap:wrap;">${tags.map((t, i) => pill(th, t, i ? th.n100 : th.accent, U(27))).join("")}</div>` : ""}
    </div>
    ${svg(officeBand(id, th, { y: 1780, dark: true }))}`,
    s: [
      `tl.fromTo(".${id}-brow",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.14)},ease:"power3.out"},${at(0.02)});`,
      `tl.to(".${id}-ch",{opacity:1,duration:0.01,ease:"steps(1)",stagger:${r(Math.max(0.012, (du(0.56)) / Math.max(1, chars.length)))}},${at(0.06)});`,
      `tl.to(".${id}-caret",{opacity:0,duration:0.19,ease:"steps(1)",repeat:${K.reps(ctx.L, 0.38)},yoyo:true},${r(ctx.T)});`,
      tags.length ? `tl.fromTo("#${id} .pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.24)},ease:"back.out(1.8)",stagger:${du(0.08)}},${at(0.7)});` : "",
      ...officeTweens(id, ctx, { scroll: 30 }), ...chromeSpin(id, ctx),
    ].filter(Boolean),
  };
}

// SHOWCASE — two numbered desk cards stacked down the frame. Reference Showcase.
function sShowcase(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(2, shots.length);
  if (!n) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const heading = String(scene.headline || scene.title || "").toUpperCase().slice(0, 18);
  // The cascade sets one span per CHARACTER in a wrapping flex row, so a fixed 104px overflowed
  // and broke mid-word ("THREE THINGS T / O NO"). Size it to the measure like any other run.
  const capSize = K.fitOne(heading, COL / K.camSafe(), U(104), K.ADVANCE.upper);
  const caps = K.bullets(scene, 2).map((b) => String(b).toUpperCase().slice(0, 18));
  return {
    backdrop: groundOf(id, th, [{ t: 0, h: 320, c: th.accent2 }]),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(180))}cqw;display:flex;flex-wrap:wrap;">
      ${heading.split("").map((c) => `<span class="${id}-cc" style="font-family:${th.displayStack};font-size:${r(capSize)}cqw;line-height:0.96;color:${th.n100};white-space:pre;opacity:0;">${esc(c)}</span>`).join("")}
    </div>
    ${Array.from({ length: n }, (_, i) => `<div style="position:absolute;left:${r(U(52))}cqw;right:${r(U(52))}cqw;top:${r(U(390 + i * 700))}cqw;">
      <div class="${id}-cap" style="display:flex;align-items:center;gap:${r(U(16))}cqw;margin-bottom:${r(U(14))}cqw;opacity:0;">
        <span style="width:${r(U(52))}cqw;height:${r(U(52))}cqw;border-radius:50%;background:${th.text};color:${th.n100};display:grid;place-items:center;font-family:${th.displayStack};font-size:${r(U(26))}cqw;flex:0 0 auto;">${i + 1}</span>
        <span style="font-family:${th.displayStack};font-size:${r(U(52))}cqw;color:${th.text};">${esc(caps[i] || "")}</span>
      </div>
      <div style="height:${r(U(550))}cqw;">${deskCard(id, th, { cls: `${id}-dk${i}`, url: ctx.url, shot: shots[i], tilt: i ? 0.8 : -0.8 })}</div>
    </div>`).join("")}
    ${svg(worker(id, { x: 120, y: 1856, s: 1, variant: "type", shirt: th.accent, hair: "#20201e", ink: th.n900 })
      + desk(id, th, { x: 150, y: 1842, w: 200 }) + coffee(id, th, { x: 980, y: 1832, s: 1.3 }))}`,
    s: [
      `tl.fromTo(".${id}-cc",{opacity:0,y:"${r(U(46))}cqw"},{opacity:1,y:0,duration:${du(0.1)},ease:"back.out(1.8)",stagger:${du(0.016)}},${at(0.03)});`,
      `tl.fromTo(".${id}-cap",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.18)},ease:"power3.out",stagger:${du(0.14)}},${at(0.12)});`,
      ...Array.from({ length: n }, (_, i) => deskCardTweens(`${id}-dk${i}`, ctx, 0.14 + i * 0.14)).flat(),
      ...officeTweens(id, ctx), ...groundTweens(id, ctx), ...chromeSpin(id, ctx),
    ],
  };
}

// HIGHLIGHT — marker sweeps growing behind each line. Reference Highlight.
function sHighlight(scene, ctx) {
  const { id, th, at, du } = ctx;
  const lines = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 16));
  if (lines.length < 2) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const cols = [th.a300, th.s300, th.a200];
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(96), 1, K.ADVANCE.upper);
  const body = String(scene.subtext || "").trim().slice(0, 110);
  const longest = lines.reduce((a, l) => Math.max(a, l.length), 1);
  const size = Math.min(U(128), ((COL / K.camSafe()) * 0.92) / (longest * K.ADVANCE.upper));
  return {
    backdrop: groundOf(id, th, [{ t: 0, h: 300, c: th.accent2 }]),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(170))}cqw;">
      <div class="${id}-head" style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.94;color:${th.n100};opacity:0;transform-origin:left center;text-transform:uppercase;">${esc(head.lines.join(" "))}</div>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(460))}cqw;display:flex;flex-direction:column;gap:${r(U(42))}cqw;">
      ${lines.map((ln, i) => `<div class="${id}-hl" style="position:relative;opacity:0;">
        <div class="${id}-mk${i}" style="position:absolute;left:${r(-U(10))}cqw;right:0;top:22%;height:62%;background:${cols[i % 3]};border-radius:${r(U(12))}cqw;transform:scaleX(0);transform-origin:left center;"></div>
        <div style="position:relative;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1.04;color:${th.text};">${esc(ln)}</div>
      </div>`).join("")}
    </div>
    ${body ? `<div class="${id}-body" style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(1200))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(34))}cqw;line-height:1.3;color:${rgba(th.text, 0.8)};opacity:0;">${esc(body)}</div>` : ""}
    ${svg(worker(id, { x: 880, y: 1740, s: 1.25, variant: "present", shirt: th.accent, hair: "#20201e", flip: true, ink: th.n900 })
      + plant(id, th, { x: 140, y: 1736 }))}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,scale:1.8},{opacity:1,scale:1,duration:${du(0.16)},ease:"expo.out"},${at(0.02)});`,
      `tl.fromTo(".${id}-hl",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${du(0.16)},ease:"power3.out",stagger:${du(0.14)}},${at(0.08)});`,
      ...lines.map((_l, i) => `tl.fromTo(".${id}-mk${i}",{scaleX:0},{scaleX:1,duration:${du(0.26)},ease:"power3.out"},${at(0.14 + i * 0.14)});`),
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.18)},ease:"power3.out"},${at(0.66)});` : "",
      ...officeTweens(id, ctx), ...groundTweens(id, ctx), ...chromeSpin(id, ctx),
    ].filter(Boolean),
  };
}

// FEATURES — a headline, a desk card, then hard-shadowed numbered cards. Reference Features.
function sFeatures(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const feats = K.bullets(scene, 3);
  const shot = shots[0] || null;
  // A picture ALONE is a legitimate features beat — the reference always shows the desk card and
  // only sometimes the numbered cards. Bail out only when there is neither.
  if (feats.length < 2 && !shot) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(118), 1, K.ADVANCE.upper);
  const top = shot ? U(1010) : U(500);
  return {
    backdrop: groundOf(id, th, [{ t: 0, h: 340, c: th.accent }]),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(190))}cqw;">
      <div class="${id}-head" style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.92;color:${th.n100};opacity:0;transform-origin:left center;text-transform:uppercase;">${esc(head.lines.join(" "))}</div>
    </div>
    ${shot ? `<div style="position:absolute;left:${r(U(52))}cqw;right:${r(U(52))}cqw;top:${r(U(400))}cqw;height:${r(U(550))}cqw;">${deskCard(id, th, { cls: `${id}-dk`, url: ctx.url, shot })}</div>` : ""}
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(top)}cqw;display:flex;flex-direction:column;gap:${r(U(22))}cqw;">
      ${feats.map((f, i) => {
    const bg = [th.accent, th.n100, th.accent2][i % 3], ink = K.inkOn(bg, T.text, T.n100);
    return `<div class="${id}-ft" style="opacity:0;transform-origin:left center;">
        <div style="background:${bg};border:${r(U(4))}cqw solid ${th.text};border-radius:${r(U(16))}cqw;box-shadow:0 ${r(U(12))}cqw 0 ${rgba(th.text, 0.9)};padding:${r(U(24))}cqw ${r(U(30))}cqw;display:flex;gap:${r(U(24))}cqw;align-items:center;box-sizing:border-box;">
          <span style="flex:0 0 auto;width:${r(U(78))}cqw;height:${r(U(78))}cqw;border-radius:50%;background:${th.text};color:${bg};display:grid;place-items:center;font-family:${th.displayStack};font-size:${r(U(34))}cqw;">${K.pad2(i + 1)}</span>
          <span style="font-family:${th.displayStack};font-size:${r(U(56))}cqw;line-height:1;color:${ink};">${esc(String(f).toUpperCase().slice(0, 22))}</span>
        </div>
      </div>`;
  }).join("")}
    </div>
    ${svg(worker(id, { x: 950, y: 1856, s: 1.05, variant: "call", shirt: th.s600, hair: "#4a3427", flip: true, ink: th.n900 })
      + plant(id, th, { x: 80, y: 1852, s: 0.95 }))}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,scale:1.9},{opacity:1,scale:1,duration:${du(0.18)},ease:"expo.out"},${at(0.03)});`,
      ...(shot ? deskCardTweens(`${id}-dk`, ctx, 0.12) : []),
      `tl.fromTo(".${id}-ft",{opacity:0,scale:1.7},{opacity:1,scale:1,duration:${du(0.16)},ease:"expo.out",stagger:${du(0.11)}},${at(0.34)});`,
      ...officeTweens(id, ctx), ...groundTweens(id, ctx), ...chromeSpin(id, ctx),
    ],
  };
}

// FLIPWORDS — words flipping up in 3D one after another. Reference FlipWords.
function sFlipWords(scene, ctx) {
  const { id, th, at, du } = ctx;
  const words = K.wordsOf(scene.emphasis || scene.headline || "").slice(0, 4).map((w) => w.toUpperCase());
  if (words.length < 2) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const longest = words.reduce((a, w) => Math.max(a, w.length), 1);
  const size = Math.min(U(182), ((COL / K.camSafe()) * 0.92) / (longest * K.ADVANCE.upper));
  return {
    backdrop: groundOf(id, th, [{ t: 0, h: 260, c: th.accent }], th.a200),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(380))}cqw;perspective:${r(U(1200))}cqw;">
      ${words.map((w, i) => {
    const boxed = i % 2 === 1;
    return `<div class="${id}-fw" style="opacity:0;transform-origin:center bottom;margin-bottom:${r(U(10))}cqw;">
        <span style="display:inline-block;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1;color:${boxed ? th.n100 : th.text};background:${boxed ? th.text : "transparent"};border-radius:${boxed ? r(U(16)) + "cqw" : "0"};padding:${boxed ? `0 ${r(U(24))}cqw ${r(U(10))}cqw` : `0 0 ${r(U(10))}cqw`};">${esc(w)}</span>
      </div>`;
  }).join("")}
    </div>
    ${svg(officeBand(id, th, { y: 1800 }))}`,
    s: [
      `tl.fromTo(".${id}-fw",{opacity:0,rotationX:-92},{opacity:1,rotationX:0,duration:${du(0.22)},ease:"back.out(1.7)",stagger:${du(0.13)}},${at(0.05)});`,
      ...officeTweens(id, ctx, { scroll: 70 }), ...groundTweens(id, ctx), ...chromeSpin(id, ctx),
    ],
  };
}

// TEAM — headline, a hard-shadowed quote card, then a ruled roster. Reference Team.
function sTeam(scene, ctx) {
  const { id, th, at, du } = ctx;
  const roster = K.bullets(scene, 3);
  if (roster.length < 2) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(128), 2, K.ADVANCE.upper);
  const quote = String(scene.emphasis || "").trim().slice(0, 60);
  const ink = K.inkOn(th.accent, T.text, T.n100);
  return {
    backdrop: groundOf(id, th, [{ t: 0, h: 420, c: th.a200 }, { t: 1600, h: 320, c: th.s200 }]),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(180))}cqw;">
      <div class="${id}-head" style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.9;color:${th.text};opacity:0;transform-origin:left center;text-transform:uppercase;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${quote ? `<div style="position:absolute;left:${r(U(52))}cqw;right:${r(U(52))}cqw;top:${r(U(560))}cqw;">
      <div class="${id}-q" style="background:${th.accent};border:${r(U(5))}cqw solid ${th.text};border-radius:${r(U(16))}cqw;box-shadow:0 ${r(U(14))}cqw 0 ${rgba(th.text, 0.9)};padding:${r(U(30))}cqw ${r(U(34))}cqw;box-sizing:border-box;opacity:0;">
        <div style="font-family:${th.displayStack};font-size:${r(U(40))}cqw;line-height:0.9;color:${ink};opacity:0.5;">“</div>
        <div style="margin-top:${r(-U(8))}cqw;font-family:${th.displayStack};font-size:${r(U(62))}cqw;line-height:1.02;color:${ink};">${esc(quote)}</div>
      </div>
    </div>` : ""}
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(930))}cqw;display:flex;flex-direction:column;">
      ${roster.map((p) => {
    const s = String(p); const cut = s.indexOf(" ");
    const name = (cut > 0 ? s.slice(0, cut) : s).toUpperCase().slice(0, 12);
    const rest = cut > 0 ? s.slice(cut + 1) : "";
    return `<div class="${id}-rs" style="border-top:${r(U(4))}cqw solid ${th.text};padding:${r(U(20))}cqw ${r(U(4))}cqw ${r(U(22))}cqw;opacity:0;">
        <div style="display:flex;align-items:baseline;gap:${r(U(22))}cqw;flex-wrap:wrap;">
          <span style="font-family:${th.displayStack};font-size:${r(U(90))}cqw;line-height:0.9;color:${th.text};">${esc(name)}</span>
          ${rest ? `<span style="font-family:${th.bodyStack};font-weight:800;font-size:${r(U(28))}cqw;letter-spacing:0.08em;text-transform:uppercase;color:${th.accent};">${esc(rest.slice(0, 26))}</span>` : ""}
        </div>
      </div>`;
  }).join("")}
      <div class="${id}-rs" style="border-top:${r(U(4))}cqw solid ${th.text};opacity:0;"></div>
    </div>
    ${svg(officeBand(id, th, { y: 1640 }) + plant(id, th, { x: 1000, y: 1636, s: 0.9 }))}
    ${ticker(id, th, { text: String(scene.kicker || STRINGS.team).toUpperCase(), bg: th.accent2, y: 1466, rot: -2 })}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,scale:1.9},{opacity:1,scale:1,duration:${du(0.18)},ease:"expo.out"},${at(0.03)});`,
      quote ? `tl.fromTo(".${id}-q",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.24)},ease:"back.out(1.8)"},${at(0.24)});` : "",
      `tl.fromTo(".${id}-rs",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.18)},ease:"power3.out",stagger:${du(0.11)}},${at(0.4)});`,
      ...tickerTween(id, ctx, 165), ...officeTweens(id, ctx, { scroll: 52 }), ...groundTweens(id, ctx), ...chromeSpin(id, ctx),
    ].filter(Boolean),
  };
}

// BIGQUOTE — the sage-flooded verdict, word by word. Reference BigQuote.
function sBigQuote(scene, ctx) {
  const { id, th, at, du } = ctx;
  const words = K.wordsOf(scene.emphasis || scene.headline || "").slice(0, 18);
  if (words.length < 3) return { ...K.statement(scene, ctx), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const ink = K.inkOn(th.accent2, T.text, T.n100);
  const run = words.join(" ");
  const size = Math.min(U(92), ((COL / K.camSafe()) * 0.92 * 3) / Math.max(1, run.length * K.ADVANCE.mixed));
  const by = String(scene.subtext || "").trim().slice(0, 40);
  return {
    backdrop: groundOf(id, th, [], th.accent2),
    chrome: chrome(ctx, ink),
    capTint: ink,
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(250))}cqw;font-family:${th.displayStack};font-size:${r(U(220))}cqw;line-height:0.6;color:${rgba(ink, 0.45)};">“</div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(470))}cqw;display:flex;flex-wrap:wrap;">
      ${words.map((w) => `<span class="${id}-qw" style="font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1.14;color:${ink};margin-right:${r(U(20))}cqw;opacity:0;transform-origin:left bottom;">${esc(w)}</span>`).join("")}
    </div>
    ${by ? `<div class="${id}-by" style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(1320))}cqw;display:flex;align-items:center;gap:${r(U(20))}cqw;opacity:0;">
      <span class="${id}-byr" style="width:${r(U(90))}cqw;height:${r(U(6))}cqw;background:${ink};transform:scaleX(0);transform-origin:left center;flex:0 0 auto;"></span>
      <span style="font-family:${th.bodyStack};font-weight:800;font-size:${r(U(30))}cqw;letter-spacing:0.1em;text-transform:uppercase;color:${ink};">${esc(by)}</span>
    </div>` : ""}
    ${svg(worker(id, { x: 200, y: 1800, s: 1.2, variant: "wave", shirt: th.n100, hair: "#20201e", ink: th.n900 })
      + worker(id, { x: 860, y: 1800, s: 1.15, variant: "type", shirt: th.a200, hair: "#3b2a1d", ink: th.n900 })
      + desk(id, th, { x: 890, y: 1786, w: 210 }))}`,
    s: [
      `tl.fromTo(".${id}-qw",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.18)},ease:"back.out(1.7)",stagger:${du(0.045)}},${at(0.05)});`,
      by ? `tl.fromTo(".${id}-by",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.18)},ease:"power3.out"},${at(0.66)});` : "",
      by ? `tl.fromTo(".${id}-byr",{scaleX:0},{scaleX:1,duration:${du(0.24)},ease:"power3.out"},${at(0.66)});` : "",
      ...officeTweens(id, ctx), ...chromeSpin(id, ctx),
    ].filter(Boolean),
  };
}

// NUMBERS — the accent-flooded proof beat: stacked cream stat cards. Reference Numbers.
//
// DELIBERATE DEVIATION. The reference floods this beat with flat accent and carries no picture.
// It takes one here, as a heavily-scrimmed band behind the cards, for a structural reason: the
// stats rule means every other role DECLINES a figure-bearing beat, so on a five-scene deck the
// spine is hook · reveal · showcase · numbers · cta and only two scenes can hold an image —
// below the portrait guard's floor of three. Without a slot here a collected asset is stranded.
// The scrim is heavy enough that the beat still reads as the flat accent moment it should be.
function sNumbers(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: groundOf(id, th, []), chrome: chrome(ctx) };
  const shot = (shots || [])[0] || null;
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(140), 2, K.ADVANCE.upper);
  return {
    backdrop: shot
      ? `<div style="position:absolute;inset:0;background:${th.accent};overflow:hidden;">
          <div class="${id}-nb" style="position:absolute;inset:0;">${K.shotFill(shot, { bg: th.accent })}</div>
          <div style="position:absolute;inset:0;background:${rgba(th.accent, 0.9)};"></div>
        </div>`
      : groundOf(id, th, [], th.accent),
    chrome: chrome(ctx, K.inkOn(th.accent, T.text, T.n100)),
    capTint: K.inkOn(th.accent, T.text, T.n100),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(220))}cqw;">
      <div class="${id}-head" style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.9;color:${th.n100};opacity:0;transform-origin:left center;text-transform:uppercase;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(640))}cqw;display:flex;flex-direction:column;gap:${r(U(28))}cqw;">
      ${stats.map((st, i) => `<div class="${id}-c${i}" style="opacity:0;transform-origin:left center;">
        <div style="background:${th.n100};border:${r(U(5))}cqw solid ${th.text};border-radius:${r(U(16))}cqw;box-shadow:0 ${r(U(14))}cqw 0 ${rgba(th.text, 0.9)};padding:${r(U(30))}cqw ${r(U(40))}cqw;display:flex;align-items:center;justify-content:space-between;gap:${r(U(20))}cqw;box-sizing:border-box;">
          <div style="font-family:${th.displayStack};font-size:${r(U(162))}cqw;line-height:0.84;color:${th.a700};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
          <div style="font-family:${th.displayStack};font-size:${r(U(36))}cqw;color:${th.text};text-align:right;max-width:${r(U(300))}cqw;line-height:1.08;text-transform:uppercase;">${esc(K.statLabel(scene, i))}</div>
        </div>
      </div>`).join("")}
    </div>
    ${svg(worker(id, { x: 180, y: 1856, s: 1.15, variant: "wave", shirt: th.n100, hair: "#20201e", ink: th.n900 })
      + worker(id, { x: 880, y: 1856, s: 1.1, variant: "walk", shirt: th.s200, hair: "#3b2a1d", flip: true, ink: th.n900 }))}
    ${ticker(id, th, { text: String(scene.kicker || STRINGS.numbers).toUpperCase(), bg: th.n100, y: 1660, rot: 1.6 })}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,scale:2},{opacity:1,scale:1,duration:${du(0.18)},ease:"expo.out"},${at(0.03)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:1.8},{opacity:1,scale:1,duration:${du(0.18)},ease:"expo.out"},${at(0.16 + i * 0.12)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.4)},ease:"expo.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.2 + i * 0.12)});`,
        ];
      }),
      ...tickerTween(id, ctx, 215), ...officeTweens(id, ctx), ...chromeSpin(id, ctx),
    ],
  };
}

// CTA — the close: a round logo plate, a slammed headline, the body and a full-width button.
function sCTA(scene, ctx, _shots, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, COL / K.camSafe(), U(168), 2, K.ADVANCE.upper);
  const body = String(scene.subtext || "").trim().slice(0, 110);
  const action = K.clampWords(String(scene.emphasis || ""), 22) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  return {
    backdrop: groundOf(id, th, [{ t: 0, h: 300, c: th.accent2 }, { t: 1660, h: 260, c: th.accent }]),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:${r(U(60))}cqw;right:${r(U(60))}cqw;top:${r(U(370))}cqw;display:flex;flex-direction:column;align-items:center;">
      <div class="${id}-mark" style="width:${r(U(210))}cqw;height:${r(U(210))}cqw;border-radius:50%;background:${th.n100};border:${r(U(5))}cqw solid ${th.text};box-shadow:0 ${r(U(14))}cqw 0 ${rgba(th.text, 0.9)};overflow:hidden;padding:${r(U(28))}cqw;margin-bottom:${r(U(36))}cqw;box-sizing:border-box;display:grid;place-items:center;opacity:0;">
        ${hasMark ? `<img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;">` : `<span style="font-family:${th.displayStack};font-size:${r(U(96))}cqw;color:${th.accent};line-height:1;">${esc((ctx.brand || "T").trim().charAt(0).toUpperCase())}</span>`}
      </div>
      <div class="${id}-head" style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.9;color:${th.text};text-align:center;opacity:0;text-transform:uppercase;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(18))}cqw;max-width:${r(U(850))}cqw;text-align:center;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(33))}cqw;line-height:1.28;color:${rgba(th.text, 0.8)};opacity:0;">${esc(body)}</div>` : ""}
      <div class="${id}-btn" style="margin-top:${r(U(40))}cqw;width:100%;opacity:0;">
        <div style="display:flex;align-items:center;justify-content:center;gap:${r(U(16))}cqw;padding:${r(U(36))}cqw 0;border-radius:${r(U(999))}cqw;background:${th.accent};color:${th.n100};border:${r(U(5))}cqw solid ${th.text};box-shadow:0 ${r(U(16))}cqw 0 ${rgba(th.text, 0.9)};font-family:${th.displayStack};font-size:${r(K.fitOne(action, U(760), U(56), K.ADVANCE.upper))}cqw;box-sizing:border-box;white-space:nowrap;">${esc(action.toUpperCase())} ➜</div>
        <div style="margin-top:${r(U(22))}cqw;text-align:center;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(32))}cqw;color:${rgba(th.text, 0.72)};">${esc(ctx.url)}</div>
      </div>
    </div>
    ${svg(officeBand(id, th, { y: 1856 }))}`,
    s: [
      `tl.fromTo(".${id}-mark",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${du(0.26)},ease:"back.out(1.8)"},${at(0.06)});`,
      `tl.fromTo(".${id}-head",{opacity:0,scale:2.2},{opacity:1,scale:1,duration:${du(0.2)},ease:"expo.out"},${at(0.16)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.18)},ease:"power3.out"},${at(0.38)});` : "",
      `tl.fromTo(".${id}-btn",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.26)},ease:"back.out(1.8)"},${at(0.5)});`,
      ...officeTweens(id, ctx, { scroll: 58 }), ...groundTweens(id, ctx), ...chromeSpin(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
// All FOURTEEN reference scenes are present. Middle roles walk in the reference's own order.
const SPEC = {
  first: "hook", last: "cta",
  // Reference order, with ONE deliberate move: `reveal` leads the middle. The reference runs
  // fourteen beats and reaches its picture roles comfortably; a five- or seven-scene cut only
  // spends three to five middle slots, and with reveal sitting fourth the product never landed
  // — the portrait asset guard correctly failed a deck whose pictures were all stranded.
  // Reference order, with the PICTURE beats pulled to the front of the middle. The reference
  // runs fourteen beats and reaches reveal/problem/showcase/features comfortably; a five-scene
  // cut spends only three middle slots, and with the picture beats sitting 2nd, 4th and 6th the
  // deck's images were all stranded — the portrait asset guard correctly failed it. Leading with
  // them also reads correctly as a short cut: the product lands, the pain is shown, the screens
  // are toured, and the typography beats follow in a longer film.
  middle: ["reveal", "showcase", "features", "problem", "typewall", "outline", "typewriter", "highlight", "flipwords", "team", "bigquote", "numbers"],
  shapes: {
    hook: [], typewall: [], problem: [COL / U(300)], outline: [], reveal: [16 / 9],
    typewriter: [], showcase: [16 / 9, 16 / 9], highlight: [], features: [16 / 9],
    flipwords: [], team: [], bigquote: [], numbers: [COL / U(1920)], cta: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "showcase" ? (budget >= 4 ? 2 : Math.min(1, Math.max(0, budget)))
    : role === "reveal" || role === "features" || role === "problem" || role === "numbers" ? 1 : 0),
  needs: (role) => (role === "reveal" || role === "showcase" ? 1 : 0),
  // `numbers` is the only layout that prints figures AS figures, so every other role declines a
  // beat carrying two or more of them — the role cursor ROTATES, it does not prioritise.
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "numbers") return isStats;
    if (isStats) return false;
    if (role === "reveal" || role === "showcase") return budget >= 1;
    if (role === "features") return budget >= 1 || K.bullets(scene, 3).length >= 2;
    if (role === "problem" || role === "highlight") return K.bullets(scene, 3).length >= 2;
    if (role === "typewall") return K.bullets(scene, 4).length >= 2 || K.wordsOf(scene.emphasis || scene.headline || "").length >= 2;
    if (role === "team") return K.bullets(scene, 3).length >= 2;
    if (role === "outline") return K.wordsOf(scene.emphasis || scene.headline || "").length >= 1;
    if (role === "flipwords") return K.wordsOf(scene.emphasis || scene.headline || "").length >= 2;
    if (role === "bigquote") return K.wordsOf(scene.emphasis || scene.headline || "").length >= 3;
    if (role === "typewriter") return !!String(scene.emphasis || scene.headline || "").trim();
    return true;
  },
};
const BUILDERS = {
  hook: sHook, typewall: sTypeWall, problem: sProblem, outline: sOutline, reveal: sReveal,
  typewriter: sTypewriter, showcase: sShowcase, highlight: sHighlight, features: sFeatures,
  flipwords: sFlipWords, team: sTeam, bigquote: sBigQuote, numbers: sNumbers, cta: sCTA,
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: groundOf(ctx.id, ctx.th, []), chrome: chrome(ctx) }),
};
const LABELS = {
  hook: STRINGS.hook, typewall: STRINGS.wall, problem: STRINGS.problem, outline: STRINGS.outline,
  reveal: STRINGS.reveal, typewriter: STRINGS.typewriter, showcase: STRINGS.showcase,
  highlight: STRINGS.highlight, features: STRINGS.features, flipwords: STRINGS.flip,
  team: STRINGS.team, bigquote: STRINGS.quote, numbers: STRINGS.numbers, cta: STRINGS.cta,
};

// The reference's `.washed` photo treatment from the Organic design system.
const css = (th, stage) => `${K.baseCss(th, stage)}
.washed{filter:sepia(0.10) saturate(0.94) contrast(1.02);}
#stage img{image-rendering:auto;}`;

function buildComposition(input) {
  return K.buildFilm({
    ...input, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS, css,
    refBeat: 2.6,                       // the reference runs 14 scenes in ~35.8s
    camera: { push: 0.026, drift: 0.014 },
    signature: "kinetic",
    fallbackBrand: "TEAMPULSE",
  });
}

module.exports = { buildComposition };
